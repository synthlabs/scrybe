use crate::{ws, Client, Clients, WSResult};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use warp::{http::StatusCode, reply::json, ws::Message, Reply};
#[derive(Deserialize, Debug)]
pub struct RegisterRequest {
    user_id: usize,
    topic: String,
}

#[derive(Deserialize)]
pub struct TopicActionRequest {
    topic: String,
    client_id: String,
}

#[derive(Serialize, Debug)]
pub struct RegisterResponse {
    url: String,
}

#[derive(Deserialize, Debug)]
pub struct Event {
    topic: String,
    user_id: Option<usize>,
    message: String,
}

pub async fn ws_handler(ws: warp::ws::Ws, id: String, clients: Clients) -> WSResult<impl Reply> {
    let client = clients.read().await.get(&id).cloned();
    match client {
        Some(c) => Ok(ws.on_upgrade(move |socket| ws::client_connection(socket, id, clients, c))),
        None => Err(warp::reject::not_found()),
    }
}
