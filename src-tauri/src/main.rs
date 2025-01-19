use futures::{
    join,
    stream::{SplitSink, SplitStream},
    SinkExt, StreamExt,
};
use rust_embed::RustEmbed;

use scrybe_core::{
    audio::AudioManager,
    types::{AppState, WhisperParams, WhisperSegment},
    whisper::WhisperManager,
};

use serde::Deserialize;
use serde_json::json;
use std::{
    env,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{App, AppHandle, Emitter, Listener, Manager, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::broadcast::{self, Sender};
use uuid::Uuid;
use warp::{filters::ws::WebSocket, ws::Message, Filter};

const DEFAULT_AUDIO_STEP_SIZE: u64 = 250; //ms

type SharedAppState = Arc<Mutex<AppState>>;
type SharedInternalState = Arc<Mutex<InternalState>>;
type SharedWhisperManager = Arc<Mutex<WhisperManager>>;

#[derive(Debug, Clone)]
struct InternalState {
    transcribe_running: bool,
    audio_step_size: u64,
}

#[derive(RustEmbed)]
#[folder = "../build"]
struct Static;

#[tauri::command]
fn get_appstate(app_state: State<'_, SharedAppState>) -> AppState {
    println!(
        "{:?} get_appstate",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis()
    );
    app_state.lock().unwrap().clone()
}

#[tauri::command]
fn get_transcribe_running(state: State<'_, SharedInternalState>) -> bool {
    println!(
        "{:?} get_transcribe_running",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis()
    );
    state.lock().unwrap().transcribe_running
}

#[tauri::command(rename_all = "snake_case")]
fn set_appstate(app: AppHandle, app_state: State<'_, SharedAppState>, new_value: AppState) {
    println!(
        "{:?} set_appstate",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis()
    );
    let mut current_state = app_state.lock().unwrap();

    if new_value.model_path != current_state.model_path {
        setup_whisper_manager(&app, new_value.clone());
    }

    *current_state = new_value.clone();

    app.emit("appstate_update", current_state.clone())
        .expect("unable to emit state");
}

#[tauri::command]
fn stop_transcribe(app: AppHandle, internal_state: State<'_, SharedInternalState>) {
    let mut state = internal_state.lock().unwrap();
    state.transcribe_running = false;
    app.emit("transcribe_running", state.transcribe_running)
        .expect("unable to emit state");
}

#[tauri::command]
fn start_transcribe(app: AppHandle) -> Result<(), ()> {
    let app_handle_ref = app.clone();

    std::thread::spawn(move || {
        let wm_state_ref = app_handle_ref.state::<SharedWhisperManager>();
        let app_state_ref = app_handle_ref.state::<SharedAppState>();
        let internal_state_ref = app_handle_ref.state::<SharedInternalState>();

        let writer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
        let mut audio_manager =
            AudioManager::new(writer.clone()).expect("unable to create audio manager");

        if let Ok(mut state) = internal_state_ref.lock() {
            state.transcribe_running = true;
            app.emit("transcribe_running", state.transcribe_running)
                .expect("unable to emit state");
        }

        println!("Begin recording...");

        audio_manager.play_stream().expect("unable play stream");

        let mut current_segment = WhisperSegment {
            id: Uuid::new_v4().to_string(),
            index: 0,
            items: vec![],
        };
        let mut segment_start_time = SystemTime::now();
        let mut samples: Vec<f32> = Vec::new();
        loop {
            let mut step_size = 0;
            let mut segment_size = 0;
            let mut whisper_params = WhisperParams::default();
            if let Ok(state) = app_state_ref.lock() {
                println!("app state syncing");
                segment_size = state.audio_segment_size.try_into().unwrap_or(2);
                whisper_params = state.whisper_params.clone();
                println!("segment duration {}", segment_size);
            }

            if let Ok(state) = internal_state_ref.lock() {
                println!("internal app state syncing");
                step_size = state.audio_step_size;

                println!("checking running status");
                if !state.transcribe_running {
                    println!("stopping");
                    break;
                }
            }

            println!("waiting for {}ms", step_size);
            std::thread::sleep(std::time::Duration::from_millis(step_size));

            println!("copying buffer");
            if let Ok(mut guard) = writer.lock() {
                println!("guard len {}", guard.len());
                samples.append(&mut guard);
            }
            println!("processing {}", samples.len());
            if samples.len() == 0 {
                println!("no samples yet");
                std::thread::sleep(std::time::Duration::from_secs(2));
                continue;
            }

            {
                println!("getting whisper manager");
                let mut whisper_manager = wm_state_ref.lock().unwrap();

                let segments =
                    match whisper_manager.process_samples(samples.clone(), whisper_params) {
                        Ok(segments) => segments,
                        Err(err) => {
                            println!("ERROR {}", err);
                            continue;
                        }
                    };

                current_segment.items = segments;

                app.emit("segment_update", current_segment.clone())
                    .expect("failed to emit event");
            }
            println!(
                "{:#?} elapsed since start",
                segment_start_time.elapsed().unwrap()
            );

            if segment_start_time.elapsed().unwrap() > Duration::from_secs(segment_size) {
                println!(
                    "trimming samples, total {}, removing {}",
                    samples.len(),
                    (samples.len() - 500)
                );

                // leave the last half second of the previous sample
                let _ = samples.drain(..(samples.len() - 500));

                segment_start_time = SystemTime::now();
                current_segment = WhisperSegment {
                    id: Uuid::new_v4().to_string(),
                    index: current_segment.index + 1,
                    items: vec![],
                };
            }
        }
    });

    println!("done with transcribe command");
    Ok(())
}

fn get_config<T>(handle: &mut App, file: &str, key: &str, default_val: T) -> T
where
    T: for<'a> Deserialize<'a>,
{
    let config_store = handle.store(file).expect("unable to get config store");

    if let std::option::Option::Some(binding) = config_store.get(key) {
        println!("{} - {}", key, binding["value"]);
        return serde_json::from_value(binding["value"].clone()).unwrap();
    } else {
        default_val
    }
}

fn setup_whisper_manager(app: &AppHandle, state: AppState) {
    if state.model_path == "" {
        println!("empty model path, skipping manager creation");
        return;
    }

    println!("Model path {}", state.model_path);

    println!("creating whisper context");

    let whisper_manager = WhisperManager::new(state.model_path.clone().as_str(), true).unwrap();

    app.manage(Arc::new(Mutex::new(whisper_manager)));
}

async fn handle_ws(websocket: warp::ws::WebSocket, tx: Sender<String>) {
    // receiver - this server, from websocket client
    // sender - diff clients connected to this server
    let (sender, receiver) = websocket.split();

    join!(
        handle_ws_client_writes(sender, tx),
        handle_ws_client_reads(receiver)
    );
}

async fn handle_ws_client_writes(mut ws_tx: SplitSink<WebSocket, Message>, tx: Sender<String>) {
    let mut channel = tx.subscribe();

    while let Ok(event) = channel.recv().await {
        println!("handling ws - got channel event - {}", event);
        if let Err(err) = ws_tx.send(Message::text(event)).await {
            println!("websocket error: {}", err);
            return;
        }
    }
}

async fn handle_ws_client_reads(mut rx: SplitStream<WebSocket>) {
    println!("handling ws client");

    while let Some(body) = rx.next().await {
        let message = match body {
            Ok(msg) => msg,
            Err(e) => {
                println!("error reading message on websocket: {}", e);
                break;
            }
        };

        handle_websocket_message(message).await;
    }

    // // unlisten to the event using the `id` returned on the `listen_global` function
    // // a `once_global` API is also exposed on the `App` struct
    // app.unlisten(id);
    println!("client disconnected");
}

async fn handle_websocket_message(message: Message) {
    // Skip any non-Text messages...
    let msg = if let Ok(s) = message.to_str() {
        s
    } else {
        println!("ping-pong");
        return;
    };

    println!("got request {}", msg);
}

pub fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!("{}, {argv:?}, {cwd}", app.package_info().name);
            app.emit("single-instance", argv).unwrap();
        }))
        .setup(|app| {
            let working_dir = env::current_dir().expect("unable to get working dir");
            println!("Current working dir {}", working_dir.display());

            let initial_state: AppState =
                get_config(app, "appstate.json", "object", AppState::default());

            app.store("appstate.json")
                .expect("unable to load store")
                .set("object", json!({ "value": initial_state.clone() }));

            setup_whisper_manager(app.handle(), initial_state.clone());

            app.manage(Arc::new(Mutex::new(initial_state)));
            app.manage(Arc::new(Mutex::new(InternalState {
                transcribe_running: false,
                audio_step_size: DEFAULT_AUDIO_STEP_SIZE,
            })));

            let (tx, _rx) = broadcast::channel::<String>(16);
            let producer = tx.clone();

            app.listen("segment_update", move |event| {
                println!("got segment update: {:?}", event.payload());
                if let Err(err) = producer.send(event.payload().to_string()) {
                    println!("Failed to produce segment to ws: {}", err);
                }
            });

            let _server_handle = tauri::async_runtime::spawn(async move {
                let static_files = warp::path("app")
                    .and(warp::get())
                    .and(warp_embed::embed(&Static))
                    .boxed();

                let ws_route = warp::path("ws")
                    .and(warp::ws())
                    .map(move |ws: warp::ws::Ws| {
                        let sender = tx.clone();
                        ws.on_upgrade(|ws| handle_ws(ws, sender))
                    });

                let cors = warp::cors()
                    .allow_any_origin()
                    .allow_methods(vec!["GET", "POST"])
                    .allow_headers(vec!["Content-Type"]);

                let routes = static_files.or(ws_route).with(cors);
                warp::serve(routes).run(([127, 0, 0, 1], 3030)).await;
            });

            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            set_appstate,
            get_appstate,
            start_transcribe,
            stop_transcribe,
            get_transcribe_running
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
