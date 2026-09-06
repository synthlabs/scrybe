use futures::{FutureExt, StreamExt};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, PoisonError},
};
use tauri_svelte_synced_store::StateSyncer;
use tokio::sync::mpsc;
use tokio_stream::wrappers::UnboundedReceiverStream;
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use warp::{filters::ws::WebSocket, reject::Rejection, ws::Message};

use crate::{
    overlay::OverlayTestState,
    types::{AppState, WebsocketRequest, WebsocketResponse},
    InternalState,
};

pub type _WSResult<T> = std::result::Result<T, Rejection>;
type Clients = Arc<Mutex<HashMap<String, Client>>>;

fn broadcast_to_clients(clients: &Clients, msg: String) {
    debug!("broadcasting: {}", msg);
    let guard = clients.lock().unwrap_or_else(PoisonError::into_inner);
    for (id, client) in guard.iter() {
        debug!("sending to {}", id);
        if let Err(err) = client.sender.send(Ok(Message::text(msg.clone()))) {
            error!("failed to send to client: {}", err);
        }
    }
}

#[derive(Debug, Clone)]
pub struct Client {
    pub client_id: String,
    pub sender: mpsc::UnboundedSender<std::result::Result<Message, warp::Error>>,
}

#[derive(Clone)]
pub struct WebsocketManager {
    pub clients: Clients,
    pub store: StateSyncer,
}

impl WebsocketManager {
    pub fn new(store: StateSyncer) -> Result<Self, anyhow::Error> {
        let clients = Arc::new(Mutex::new(HashMap::new()));
        Ok(WebsocketManager { clients, store })
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
            .unwrap_or_else(PoisonError::into_inner)
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

        self.clients
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(&uuid);
        debug!("{} disconnected", uuid);
    }

    pub fn broadcast(self, msg: String) {
        broadcast_to_clients(&self.clients, msg);
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

                {
                    let app_state_ref = self.store.get::<AppState>("app_state");
                    let app_state = app_state_ref.lock().unwrap();

                    let response =
                        Self::to_ws_response("app_state_update".to_owned(), app_state.clone());

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
            "get_internalstate" => {
                debug!("get_internalstate from websocket");

                {
                    let internal_state_ref = self.store.get::<InternalState>("internal_state");
                    let internal_state = internal_state_ref.lock().unwrap();

                    let response = Self::to_ws_response(
                        "internal_state_update".to_owned(),
                        internal_state.clone(),
                    );

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
            "get_overlay_test" => {
                let state = self.store.snapshot::<OverlayTestState>("overlay_test");
                let response = Self::to_ws_response("overlay_test_update".to_owned(), state);
                if let Ok(data) = serde_json::to_string(&response) {
                    let _ = client.sender.send(Ok(Message::text(data)));
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

#[cfg(test)]
mod tests {
    use super::*;

    type Receiver = mpsc::UnboundedReceiver<Result<Message, warp::Error>>;

    fn clients_with_receivers(count: usize) -> (Clients, Vec<Receiver>) {
        let mut clients = HashMap::new();
        let mut receivers = Vec::new();
        for index in 0..count {
            let client_id = index.to_string();
            let (sender, receiver) = mpsc::unbounded_channel();
            clients.insert(client_id.clone(), Client { client_id, sender });
            receivers.push(receiver);
        }
        (Arc::new(Mutex::new(clients)), receivers)
    }

    fn received_messages(receiver: &mut Receiver) -> Vec<String> {
        let mut messages = Vec::new();
        while let Ok(message) = receiver.try_recv() {
            messages.push(message.unwrap().to_str().unwrap().to_owned());
        }
        messages
    }

    fn assert_broadcast_delivery() {
        let (empty, _) = clients_with_receivers(0);
        broadcast_to_clients(&empty, "no clients".into());

        let (clients, mut receivers) = clients_with_receivers(3);
        broadcast_to_clients(&clients, "first".into());
        broadcast_to_clients(&clients, "second".into());
        for receiver in &mut receivers {
            assert_eq!(received_messages(receiver), ["first", "second"]);
        }

        drop(receivers.pop());
        broadcast_to_clients(&clients, "after disconnect".into());
        for receiver in &mut receivers {
            assert_eq!(received_messages(receiver), ["after disconnect"]);
        }
    }

    #[test]
    fn broadcast_from_sync_thread() {
        std::thread::spawn(assert_broadcast_delivery)
            .join()
            .unwrap();
    }

    #[test]
    fn broadcast_recovers_a_poisoned_registry() {
        let (clients, mut receivers) = clients_with_receivers(1);
        let poisoned = clients.clone();
        assert!(std::thread::spawn(move || {
            let _guard = poisoned.lock().unwrap();
            panic!("poison the client registry");
        })
        .join()
        .is_err());
        assert!(clients.is_poisoned());

        broadcast_to_clients(&clients, "after poison".into());
        assert_eq!(received_messages(&mut receivers[0]), ["after poison"]);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn broadcast_from_current_thread_runtime() {
        tokio::spawn(async { assert_broadcast_delivery() })
            .await
            .expect("broadcast task must not panic");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn broadcast_from_multithreaded_runtime() {
        tokio::spawn(async { assert_broadcast_delivery() })
            .await
            .expect("broadcast task must not panic");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn concurrent_broadcasts_have_the_same_order_for_all_clients() {
        let (clients, mut receivers) = clients_with_receivers(2);
        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        let mut tasks = Vec::new();
        for producer in 0..2 {
            let clients = clients.clone();
            let barrier = barrier.clone();
            tasks.push(tokio::spawn(async move {
                barrier.wait().await;
                for index in 0..32 {
                    broadcast_to_clients(&clients, format!("{producer}:{index}"));
                    tokio::task::yield_now().await;
                }
            }));
        }
        for task in tasks {
            task.await.expect("broadcast task must not panic");
        }

        let messages = received_messages(&mut receivers[0]);
        assert_eq!(messages.len(), 64);
        assert_eq!(messages, received_messages(&mut receivers[1]));
        let mut next_indices = [0; 2];
        for message in messages {
            let (producer, index) = message.split_once(':').unwrap();
            let producer: usize = producer.parse().unwrap();
            let index: usize = index.parse().unwrap();
            assert_eq!(index, next_indices[producer]);
            next_indices[producer] += 1;
        }
        assert_eq!(next_indices, [32, 32]);
    }
}
