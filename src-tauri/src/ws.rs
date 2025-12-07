use std::{collections::HashMap, sync::Arc};

use futures::{FutureExt, StreamExt};
use scrybe_core::types::{AppState, WebsocketRequest, WebsocketResponse};
use serde::Serialize;
use tokio::sync::{mpsc, Mutex};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use warp::{filters::ws::WebSocket, reject::Rejection, ws::Message};

pub type _WSResult<T> = std::result::Result<T, Rejection>;
type Clients = Arc<Mutex<HashMap<String, Client>>>;

#[derive(Debug, Clone)]
pub struct Client {
    pub client_id: String,
    pub sender: mpsc::UnboundedSender<std::result::Result<Message, warp::Error>>,
}

#[derive(Clone)]
pub struct WebsocketManager {
    pub clients: Clients,
    pub appstate: Arc<std::sync::Mutex<AppState>>,
}

impl WebsocketManager {
    pub fn new(appstate: Arc<std::sync::Mutex<AppState>>) -> Result<Self, anyhow::Error> {
        let clients = Arc::new(Mutex::new(HashMap::new()));
        Ok(WebsocketManager { clients, appstate })
    }

    pub async fn client_connection(self, ws: WebSocket) {
        info!("establishing client connection... {:?}", ws);

        let (client_ws_sender, mut client_ws_rcv) = ws.split();
        let (client_sender, client_rcv) = mpsc::unbounded_channel();

        let client_rcv = UnboundedReceiverStream::new(client_rcv);

        tokio::task::spawn(client_rcv.forward(client_ws_sender).map(|result| {
            if let Err(e) = result {
                error!("error sending websocket msg: {}", e);
            }
        }));

        let uuid = Uuid::new_v4().simple().to_string();

        let new_client = Client {
            client_id: uuid.clone(),
            sender: client_sender,
        };

        self.clients
            .lock()
            .await
            .insert(uuid.clone(), new_client.clone());

        while let Some(result) = client_ws_rcv.next().await {
            let msg = match result {
                Ok(msg) => msg,
                Err(e) => {
                    error!("error receiving message for id {}): {}", uuid.clone(), e);
                    break;
                }
            };
            self.clone()
                .handle_websocket_message(new_client.clone(), msg.clone());
        }

        self.clients.lock().await.remove(&uuid);
        debug!("{} disconnected", uuid);
    }

    pub fn broadcast(self, msg: String) {
        debug!("broadcasting: {}", msg);
        match self.clients.blocking_lock() {
            guard => {
                for (id, client) in guard.iter() {
                    debug!("sending to {}", id);

                    match client.sender.send(Ok(Message::text(msg.clone()))) {
                        Ok(_) => {}
                        Err(err) => error!("failed to send to client: {}", err),
                    };
                }
            }
        }
    }

    fn handle_websocket_message(self, client: Client, message: Message) {
        // Skip any non-Text messages...
        let msg = if let Ok(s) = message.to_str() {
            s
        } else {
            debug!("ping-pong");
            return;
        };

        info!("[{}] got request {}", client.client_id, msg);

        let request: WebsocketRequest = match serde_json::from_str(msg) {
            Ok(result) => result,
            Err(err) => {
                error!("failed to parse websocket request: {}", err);
                return;
            }
        };

        match request.kind.as_str() {
            "get_appstate" => {
                debug!("get_appstate from websocket");

                if let Ok(guard) = self.appstate.lock() {
                    let response =
                        Self::to_ws_response("appstate_update".to_owned(), &guard.to_owned());

                    let response_str = match serde_json::to_string(&response) {
                        Ok(data) => data,
                        Err(err) => {
                            error!("failed to serialize response: {}", err);
                            return;
                        }
                    };

                    match client.sender.send(Ok(Message::text(response_str.clone()))) {
                        Ok(_) => {}
                        Err(err) => error!("failed to send to client: {}", err),
                    };
                }
            }
            "" => warn!("missing kind"),
            _ => warn!("unknown kind"),
        }
    }

    pub fn to_ws_response<T>(kind: String, object: T) -> WebsocketResponse
    where
        T: for<'a> Serialize,
    {
        let mut response = WebsocketResponse::default();
        response.kind = kind;
        response.data = match serde_json::to_string(&object) {
            Ok(data) => data,
            Err(err) => {
                error!("failed to serialize object: {}", err);
                response.is_error = true;
                err.to_string()
            }
        };

        response
    }
}
