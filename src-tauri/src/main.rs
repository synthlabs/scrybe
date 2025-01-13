use rust_embed::RustEmbed;

use scrybe_core::{
    audio::AudioManager,
    types::{AppState, WhisperParams, WhisperToggles},
    whisper::{Batch, WhisperManager},
};

use serde::Deserialize;
use serde_json::json;
use std::{
    collections::HashMap,
    convert::Infallible,
    env,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{App, AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;
use warp::{reject::Rejection, ws::Message, Filter};

use tokio::sync::{mpsc, RwLock};

mod handler;
mod ws;

type WSResult<T> = std::result::Result<T, Rejection>;
type Clients = Arc<RwLock<HashMap<String, Client>>>;

#[derive(Debug, Clone)]
pub struct Client {
    pub user_id: usize,
    pub topics: Vec<String>,
    pub sender: Option<mpsc::UnboundedSender<std::result::Result<Message, warp::Error>>>,
}

#[derive(Debug, Clone)]
struct InternalState {
    transcribe_running: bool,
}

#[derive(RustEmbed)]
#[folder = "../build"]
struct Static;

#[tauri::command]
fn get_appstate(app_state: State<'_, Mutex<AppState>>) -> AppState {
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
fn get_transcribe_running(state: State<'_, Mutex<InternalState>>) -> bool {
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
fn set_appstate(app: AppHandle, app_state: State<'_, Mutex<AppState>>, mut new_value: AppState) {
    println!(
        "{:?} set_appstate",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis()
    );
    let mut current_state = app_state.lock().unwrap();
    new_value.generation += 1;

    if new_value.model_path != current_state.model_path {
        setup_whisper_manager(&app, new_value.clone());
    }

    *current_state = new_value.clone();

    app.emit("appstate_update", current_state.clone())
        .expect("unable to emit state");
}

#[tauri::command]
fn stop_transcribe(app: AppHandle, internal_state: State<'_, Mutex<InternalState>>) {
    let mut state = internal_state.lock().unwrap();
    state.transcribe_running = false;
    app.emit("transcribe_running", state.transcribe_running)
        .expect("unable to emit state");
}

#[tauri::command]
async fn start_transcribe(
    app: AppHandle,
    wm_state: State<'_, Mutex<WhisperManager>>,
    app_state: State<'_, Mutex<AppState>>,
    internal_state: State<'_, Mutex<InternalState>>,
) -> Result<(), ()> {
    let writer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut audio_manager =
        AudioManager::new(writer.clone()).expect("unable to create audio manager");

    if let Ok(mut state) = internal_state.lock() {
        state.transcribe_running = true;
        app.emit("transcribe_running", state.transcribe_running)
            .expect("unable to emit state");
    }

    println!("Begin recording...");

    audio_manager.play_stream().expect("unable play stream");

    loop {
        if let Ok(state) = internal_state.lock() {
            println!("checking running status");
            if !state.transcribe_running {
                println!("stopping");
                break;
            }
        }

        let mut duration = 0;
        let mut whisper_params = WhisperParams::default();
        if let Ok(state) = app_state.lock() {
            println!("app state syncing");
            duration = state.audio_buffer_size.try_into().unwrap_or(2);
            whisper_params = state.whisper_params.clone();
            println!("duration {}", duration);
        }

        println!("waiting for {}s", duration);
        std::thread::sleep(std::time::Duration::from_secs(duration));

        let mut samples: Vec<f32> = Vec::new();
        println!("copying buffer");
        if let Ok(mut guard) = writer.lock() {
            samples.append(&mut guard);
        }
        println!("processing {}", samples.len());

        {
            println!("getting whisper manager");
            let mut whisper_manager = wm_state.lock().unwrap();

            let segments = match whisper_manager.process_samples(samples.clone(), whisper_params) {
                Ok(segments) => segments,
                Err(err) => {
                    println!("ERROR {}", err);
                    continue;
                }
            };

            app.emit("new_batch", Batch { segments })
                .expect("failed to emit event");
        }

        println!(
            "trimming samples, total {}, removing {}",
            samples.len(),
            (samples.len() - 2000)
        );

        // leave the last half second of the previous sample
        let _ = samples.drain(..(samples.len() - 2000));
    }
    #[allow(unreachable_code)]
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

    app.manage(Mutex::new(whisper_manager));
}

fn with_clients(clients: Clients) -> impl Filter<Extract = (Clients,), Error = Infallible> + Clone {
    warp::any().map(move || clients.clone())
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

            app.manage(Mutex::new(initial_state));
            app.manage(Mutex::new(InternalState {
                transcribe_running: false,
            }));

            let ws_clients: Clients = Arc::new(RwLock::new(HashMap::new()));

            let _server_handle = tauri::async_runtime::spawn(async move {
                let static_files = warp::path("app")
                    .and(warp::get())
                    .and(warp_embed::embed(&Static))
                    .boxed();

                let ws_route = warp::path("ws")
                    .and(warp::ws())
                    .and(warp::path::param())
                    .and(with_clients(ws_clients.clone()))
                    .and_then(handler::ws_handler);

                let cors = warp::cors()
                    .allow_any_origin()
                    .allow_methods(vec!["GET", "POST"])
                    .allow_headers(vec!["Content-Type"]);

                let routes = static_files.with(cors);
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
