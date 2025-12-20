// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use hf_hub::api::sync::Api;
use rust_embed::RustEmbed;
use scrybe_core::{
    audio::{self, AudioManager},
    whisper::WhisperManager,
};
use serde::{Deserialize, Serialize};
use std::{
    env,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Listener, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_specta::collect_commands;
use tauri_svelte_synced_store::{StateSyncer, StateSyncerConfig};
use tracing::{debug, error, info};
use uuid::Uuid;
use warp::Filter;
use ws::WebsocketManager;

mod types;
mod ws;

const DEFAULT_AUDIO_STEP_SIZE: u64 = 500; //ms
type SharedWhisperManager = Arc<Mutex<WhisperManager>>;

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
struct InternalState {
    transcribe_running: bool,
    audio_step_size: u64,
    version: String,
    name: String,
}

impl Default for InternalState {
    fn default() -> Self {
        Self {
            transcribe_running: false,
            audio_step_size: DEFAULT_AUDIO_STEP_SIZE,
            version: "".to_owned(),
            name: "".to_owned(),
        }
    }
}

#[derive(RustEmbed)]
#[folder = "../build"]
struct Static;

#[tauri::command]
#[specta::specta]
fn emit_state(
    name: String,
    state_syncer: tauri::State<'_, tauri_svelte_synced_store::StateSyncer>,
) -> bool {
    tracing::info!("emit_state: {:?}", name);

    match name.as_str() {
        "internal_state" => state_syncer.emit::<InternalState>("internal_state"),
        "app_state" => state_syncer.emit::<types::AppState>("app_state"),
        _ => return false,
    };

    return true;
}

// TODO: move this into a macro as well
#[tauri::command]
#[specta::specta]
fn update_state(
    app: AppHandle,
    ws_manager: State<'_, WebsocketManager>,
    state: tauri_svelte_synced_store::StateUpdate,
    state_syncer: tauri::State<'_, tauri_svelte_synced_store::StateSyncer>,
) -> bool {
    tracing::info!("update_state: {:?}", state);

    match state.name.as_str() {
        "internal_state" => {
            let new_internal_state: InternalState = match serde_json::from_str(state.value.as_str())
            {
                Ok(res) => res,
                Err(_) => {
                    error!("failed to parse app state");
                    return false;
                }
            };
            state_syncer.update("internal_state", new_internal_state.clone());

            let response = WebsocketManager::to_ws_response(
                "internal_state_update".to_owned(),
                new_internal_state.clone(),
            );

            match serde_json::to_string(&response) {
                Ok(msg) => <WebsocketManager as Clone>::clone(&ws_manager).broadcast(msg),
                Err(err) => error!("error creating websocket response: {}", err),
            };
        }
        "app_state" => {
            let new_app_state: types::AppState = match serde_json::from_str(state.value.as_str()) {
                Ok(res) => res,
                Err(_) => {
                    error!("failed to parse app state");
                    return false;
                }
            };

            if new_app_state.model_path
                != state_syncer
                    .snapshot::<types::AppState>("app_state")
                    .model_path
            {
                setup_whisper_manager(&app, new_app_state.clone());
            }
            state_syncer.update("app_state", new_app_state.clone());

            let response = WebsocketManager::to_ws_response(
                "app_state_update".to_owned(),
                new_app_state.clone(),
            );

            match serde_json::to_string(&response) {
                Ok(msg) => <WebsocketManager as Clone>::clone(&ws_manager).broadcast(msg),
                Err(err) => error!("error creating websocket response: {}", err),
            };
        }
        _ => {
            tracing::warn!("unknown type");
            return false;
        }
    }
    return true;
}

#[tauri::command]
#[specta::specta]
fn get_transcribe_running(
    state_syncer: tauri::State<'_, tauri_svelte_synced_store::StateSyncer>,
) -> bool {
    debug!(
        "{:?} get_transcribe_running",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis()
    );
    let internal_state_ref = state_syncer.get::<InternalState>("internal_state");
    let state = internal_state_ref.lock().unwrap();
    state.transcribe_running
}

#[tauri::command]
#[specta::specta]
fn stop_transcribe(state_syncer: tauri::State<'_, tauri_svelte_synced_store::StateSyncer>) {
    debug!(
        "{:?} stop_transcribe",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis()
    );
    let internal_state_ref = state_syncer.get::<InternalState>("internal_state");
    let mut state = internal_state_ref.lock().unwrap();

    state.transcribe_running = false;
}

#[tauri::command]
#[specta::specta]
fn start_transcribe<'a>(
    app: AppHandle,
    state_syncer: tauri::State<'_, tauri_svelte_synced_store::StateSyncer>,
) -> Result<(), ()> {
    debug!(
        "{:?} start_transcribe",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_millis()
    );

    if state_syncer
        .snapshot::<InternalState>("internal_state")
        .transcribe_running
    {
        info!("transcribe already running");
        return Err(());
    }

    let app_handle_ref = app.clone();
    let state_syncer_ref = state_syncer.inner().clone();

    std::thread::spawn(move || {
        let wm_state_ref = app_handle_ref.state::<SharedWhisperManager>();

        let writer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
        let mut audio_manager = AudioManager::new_with_default_output(writer.clone())
            .expect("unable to create audio manager");

        {
            let internal_state_ref = state_syncer_ref.get::<InternalState>("internal_state");
            let mut state = internal_state_ref.lock().unwrap();
            state.transcribe_running = true;
        }

        info!("Begin recording...");

        audio_manager.play_stream().expect("unable play stream");

        let mut current_segment = scrybe_core::whisper::WhisperSegment {
            id: Uuid::new_v4().to_string(),
            index: 0,
            items: vec![],
        };
        let mut segment_start_time = SystemTime::now();
        let mut samples: Vec<f32> = Vec::new();
        loop {
            let internal_state_ref = state_syncer_ref.snapshot::<InternalState>("internal_state");
            let app_state_ref = state_syncer_ref.snapshot::<types::AppState>("app_state");

            let whisper_params = app_state_ref.whisper_params.clone();
            debug!(
                "app state syncing: segment_size={}, whisper_params={:?}",
                app_state_ref.audio_segment_size, whisper_params
            );
            debug!(
                "internal state syncing: step_size={}, transcribe_running={}",
                internal_state_ref.audio_step_size, internal_state_ref.transcribe_running
            );

            if !internal_state_ref.transcribe_running {
                info!("stopping transcription");
                break;
            }

            debug!("waiting for {}ms", internal_state_ref.audio_step_size);
            std::thread::sleep(std::time::Duration::from_millis(
                internal_state_ref.audio_step_size,
            ));

            debug!("copying buffer");
            if let Ok(mut guard) = writer.lock() {
                debug!(
                    "guard len pre-trim {}, avg threshold {}",
                    guard.len(),
                    audio::avg_threshold(&guard)
                );
                // TODO: this should be a setting to adjust
                audio::trim_silence(&mut guard, 0.01);
                debug!("guard len post-trim {}", guard.len());
                samples.append(&mut guard);
            }

            // 8037 normal samples in 500ms
            if samples.len() > 4000 {
                debug!("got enough samples, getting whisper manager");

                let mut whisper_manager = wm_state_ref.lock().unwrap();

                let segments =
                    match whisper_manager.process_samples(samples.clone(), whisper_params) {
                        Ok(segments) => segments,
                        Err(err) => {
                            error!("ERROR {}", err);
                            continue;
                        }
                    };

                current_segment.items = segments;

                app_handle_ref
                    .emit("segment_update", current_segment.clone())
                    .expect("failed to emit event");
            }
            debug!(
                "{:#?} elapsed since start",
                segment_start_time.elapsed().unwrap()
            );

            if segment_start_time.elapsed().unwrap()
                > Duration::from_secs(app_state_ref.audio_segment_size)
            {
                debug!("trimming samples, total {}", samples.len(),);
                samples.clear();

                segment_start_time = SystemTime::now();
                current_segment = scrybe_core::whisper::WhisperSegment {
                    id: Uuid::new_v4().to_string(),
                    index: current_segment.index + 1,
                    items: vec![],
                };
                app_handle_ref
                    .emit("segment_update", current_segment.clone())
                    .expect("failed to emit event");
            }
        }
    });

    info!("done with transcribe command");
    Ok(())
}

fn setup_whisper_manager(app: &AppHandle, mut state: types::AppState) {
    if state.model_path == "" {
        info!("empty model path, pulling default model");
        let api = Api::new().unwrap();
        let repo = api.model("ggerganov/whisper.cpp".to_string());
        let filename = repo.get("ggml-small-q8_0.bin").unwrap();

        debug!("{:?}", filename);

        state.model_path = filename.to_string_lossy().into_owned();
    }

    info!("Model path {}", state.model_path);

    debug!("creating whisper context");

    let whisper_manager = WhisperManager::new(state.model_path.clone().as_str(), true).unwrap();

    app.manage(Arc::new(Mutex::new(whisper_manager)));
}

pub fn main() {
    color_eyre::install().expect("failed to install color_eyre");

    tracing_subscriber::fmt()
        // enable everything
        .with_max_level(tracing::Level::DEBUG)
        // sets this to be the default, global collector for this application.
        .init();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            info!("{}, {argv:?}, {cwd}", app.package_info().name);
            app.emit("single-instance", argv).unwrap();
        }));

    let handlers = tauri_specta::Builder::<tauri::Wry>::new()
        .typ::<InternalState>()
        .typ::<types::AppState>()
        .typ::<types::AdvancedSettings>()
        .typ::<types::OverlayConfig>()
        .typ::<types::WebsocketRequest>()
        .typ::<types::WebsocketResponse>()
        .typ::<scrybe_core::whisper::WhisperParams>()
        .typ::<scrybe_core::whisper::WhisperToggles>()
        .typ::<scrybe_core::whisper::WhisperSegment>()
        // Then register them (separated by a comma)
        .commands(collect_commands![
            start_transcribe,
            stop_transcribe,
            get_transcribe_running,
            emit_state,
            update_state,
        ]);

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    handlers
        .export(
            specta_typescript::Typescript::default()
                .formatter(specta_typescript::formatter::prettier)
                .bigint(specta_typescript::BigIntExportBehavior::Number)
                .header("/* eslint-disable */"),
            "../src/lib/bindings.ts",
        )
        .expect("Failed to export typescript bindings");

    let _builder = builder
        .invoke_handler(handlers.invoke_handler())
        .setup(move |app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())
                .unwrap();

            // This is also required if you want to use events
            handlers.mount_events(app);

            let working_dir = env::current_dir().expect("unable to get working dir");
            info!("Current working dir {}", working_dir.display());

            // info!("getting default input device");
            // let device = scrybe_core::audio::get_default_input_device()
            //     .expect("unable to get default device");

            info!("setting up state");
            let state_syncer = StateSyncer::new(
                StateSyncerConfig {
                    sync_to_disk: true,
                    ..Default::default()
                },
                app.handle().clone(),
            );
            let _ = state_syncer.load::<types::AppState>("app_state");

            let mut internal_state = state_syncer.load::<InternalState>("internal_state");
            internal_state.version = app.package_info().version.to_string();
            internal_state.name = app.package_info().name.to_string();

            info!("setting up whisper manager");
            setup_whisper_manager(app.handle(), state_syncer.snapshot("app_state"));

            app.manage::<StateSyncer>(state_syncer.clone());

            info!("setting up websocket manager");
            let ws_manager = WebsocketManager::new(state_syncer.clone()).unwrap();

            app.manage(ws_manager.clone());

            let ws_manager_ref = ws_manager.clone();
            app.listen("segment_update", move |event| {
                debug!("got segment update: {:?}", event.payload());
                let response = types::WebsocketResponse {
                    kind: "segment_update".to_owned(),
                    data: event.payload().to_string(),
                    is_error: false,
                };

                match serde_json::to_string(&response) {
                    Ok(msg) => ws_manager_ref.clone().broadcast(msg),
                    Err(err) => error!("error creating websocket response: {}", err),
                };
            });

            let ws_manager_ref = ws_manager.clone();

            let _server_handle = tauri::async_runtime::spawn(async move {
                let static_files = warp::path("app")
                    .and(warp::get())
                    .and(warp_embed::embed(&Static))
                    .boxed();

                let ws_route = warp::path("ws")
                    .and(warp::ws())
                    .map(move |ws: warp::ws::Ws| {
                        debug!("ws_handler");
                        let ws_manager_ref = ws_manager_ref.clone();
                        ws.on_upgrade(move |socket| {
                            ws_manager_ref.clone().client_connection(socket)
                        })
                    });

                let cors = warp::cors()
                    .allow_any_origin()
                    .allow_methods(vec!["GET", "POST"])
                    .allow_headers(vec!["Content-Type"]);

                let routes = static_files.or(ws_route).with(cors);
                warp::serve(routes).run(([127, 0, 0, 1], 3030)).await;
            });

            info!("creating main window");
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title(&format!(
                    "{} {}",
                    internal_state.name.clone(),
                    internal_state.version.clone()
                ))
                .inner_size(800.0, 600.0);

            let _window = win_builder.build().unwrap();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
