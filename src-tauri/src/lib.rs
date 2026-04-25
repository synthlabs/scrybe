use hf_hub::api::sync::Api;
use rust_embed::RustEmbed;
use scrybe_core::{
    audio::{self, AudioManager},
    devices::AudioDevice,
    whisper::WhisperManager,
};
use serde::{Deserialize, Serialize};
#[cfg(debug_assertions)]
use specta_typescript::Typescript;
use std::{
    env,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Listener, Manager, State, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
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

pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .typ::<InternalState>()
        .typ::<types::AppState>()
        .typ::<types::AdvancedSettings>()
        .typ::<types::OverlayConfig>()
        .typ::<types::WebsocketRequest>()
        .typ::<types::WebsocketResponse>()
        .typ::<types::ModelPreset>()
        .typ::<scrybe_core::whisper::WhisperParams>()
        .typ::<scrybe_core::whisper::WhisperToggles>()
        .typ::<scrybe_core::whisper::WhisperSegment>()
        // Then register them (separated by a comma)
        .commands(collect_commands![
            start_transcribe,
            stop_transcribe,
            get_transcribe_running,
            get_audio_devices,
            list_model_presets,
            download_model_preset,
            emit_state,
            update_state,
        ])
}

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
            state_syncer.update("internal_state", new_internal_state.clone(), true);

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
            let mut new_app_state: types::AppState =
                match serde_json::from_str(state.value.as_str()) {
                    Ok(res) => res,
                    Err(_) => {
                        error!("failed to parse app state");
                        return false;
                    }
                };

            let app_state_snapshot = state_syncer.snapshot::<types::AppState>("app_state");
            if new_app_state.model_path != app_state_snapshot.model_path {
                info!("Model path changed, re-setting up whisper manager");
                let model_path = setup_whisper_manager(&app, new_app_state.model_path.clone());
                new_app_state.model_path = model_path;
            }
            state_syncer.update("app_state", new_app_state.clone(), true);

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
fn get_audio_devices(
    _state_syncer: tauri::State<'_, tauri_svelte_synced_store::StateSyncer>,
) -> Result<Vec<AudioDevice>, String> {
    match audio::get_devices() {
        Ok(devices) => Ok(devices),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
#[specta::specta]
fn list_model_presets() -> Vec<types::ModelPreset> {
    types::model_presets()
}

#[tauri::command]
#[specta::specta]
async fn download_model_preset(preset_id: String) -> Result<String, String> {
    let preset = types::model_presets()
        .into_iter()
        .find(|p| p.id == preset_id)
        .ok_or_else(|| format!("unknown preset: {}", preset_id))?;

    tauri::async_runtime::spawn_blocking(move || download_preset_file(&preset))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
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
        let mut audio_manager = match AudioManager::new_with_device(
            writer.clone(),
            state_syncer_ref
                .snapshot::<types::AppState>("app_state")
                .current_device,
        ) {
            Ok(am) => am,
            Err(err) => {
                error!("unable to create audio manager: {}", err);
                let internal_state_ref = state_syncer_ref.get::<InternalState>("internal_state");
                let mut state = internal_state_ref.lock().unwrap();
                state.transcribe_running = false;
                return;
            }
        };

        {
            let internal_state_ref = state_syncer_ref.get::<InternalState>("internal_state");
            let mut state = internal_state_ref.lock().unwrap();
            state.transcribe_running = true;
        }

        info!("Begin recording...");

        if let Err(err) = audio_manager.play_stream() {
            error!("unable to play stream: {}", err);
            let internal_state_ref = state_syncer_ref.get::<InternalState>("internal_state");
            let mut state = internal_state_ref.lock().unwrap();
            state.transcribe_running = false;
            return;
        }

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

fn download_preset_file(preset: &types::ModelPreset) -> Result<String, anyhow::Error> {
    info!(
        "downloading model preset {} ({}/{})",
        preset.id, preset.repo, preset.filename
    );
    let api = Api::new()?;
    let repo = api.model(preset.repo.clone());
    let filename = repo.get(&preset.filename)?;
    debug!("downloaded to {:?}", filename);
    Ok(filename.to_string_lossy().into_owned())
}

fn setup_whisper_manager(app: &AppHandle, mut model_path: String) -> String {
    if model_path == "" {
        info!("empty model path, pulling default model");
        let default_preset = types::model_presets()
            .into_iter()
            .find(|p| p.id == types::DEFAULT_MODEL_PRESET_ID)
            .expect("default model preset missing from model_presets()");
        model_path =
            download_preset_file(&default_preset).expect("failed to download default model preset");
    }

    info!("Model path {}", model_path);

    debug!("creating whisper context");

    let whisper_manager = WhisperManager::new(model_path.clone().as_str(), true).unwrap();

    app.manage(Arc::new(Mutex::new(whisper_manager)));

    return model_path;
}

struct EmbedFile {
    data: std::borrow::Cow<'static, [u8]>,
}

impl warp::reply::Reply for EmbedFile {
    fn into_response(self) -> warp::reply::Response {
        warp::reply::Response::new(self.data.into())
    }
}

pub fn run() {
    color_eyre::install().expect("failed to install color_eyre");

    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .max_file_size(1_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .level(log::LevelFilter::Debug)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                ])
                .build(),
        )
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

    let handlers = specta_builder();

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    handlers
        .export(
            Typescript::default()
                .formatter(specta_typescript::formatter::prettier)
                .bigint(specta_typescript::BigIntExportBehavior::Number)
                .header("/* eslint-disable */"),
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("src-tauri has no parent directory")
                .join("src/lib/bindings.ts"),
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

            info!("setting up state");
            let state_syncer = StateSyncer::new(
                StateSyncerConfig {
                    default_persist: true,
                    ..Default::default()
                },
                app.handle().clone(),
            );
            let _ = state_syncer.load::<types::AppState>("app_state");

            let mut internal_state = state_syncer.load::<InternalState>("internal_state");
            internal_state.version = app.package_info().version.to_string();
            internal_state.name = app.package_info().name.to_string();

            {
                let app_state_ref = state_syncer.get::<types::AppState>("app_state");
                let mut app_state = app_state_ref.lock().unwrap();

                info!("setting up whisper manager");
                let model_path = setup_whisper_manager(app.handle(), app_state.model_path.clone());
                app_state.model_path = model_path;
            }

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
                    .and(warp::path::tail())
                    .and_then(move |tail: warp::path::Tail| {
                        let tail_str = tail.as_str();
                        debug!("GET {}", tail_str);

                        // Try paths in order: exact path, path with .html, path/index.html
                        let paths_to_try = if tail_str.is_empty() {
                            vec!["index.html".to_string()]
                        } else {
                            vec![
                                tail_str.to_string(),
                                format!("{}.html", tail_str),
                                format!("{}/index.html", tail_str),
                            ]
                        };

                        async move {
                            for path in paths_to_try {
                                if let Some(file) = Static::get(&path) {
                                    let mime = mime_guess::from_path(&path).first_or_octet_stream();
                                    return Ok(warp::reply::with_header(
                                        EmbedFile { data: file.data },
                                        "content-type",
                                        mime.as_ref(),
                                    ));
                                }
                            }
                            Err(warp::reject::not_found())
                        }
                    })
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
                .inner_size(1000.0, 640.0)
                .min_inner_size(880.0, 560.0)
                .resizable(true);

            #[cfg(target_os = "macos")]
            let win_builder = win_builder.title_bar_style(TitleBarStyle::Transparent);

            let window = win_builder.build().unwrap();

            #[cfg(target_os = "macos")]
            {
                use objc2_app_kit::{NSColor, NSWindow};
                unsafe {
                    let ns_window = &*(window.ns_window().unwrap() as *mut NSWindow);
                    let bg_color = NSColor::colorWithRed_green_blue_alpha(
                        20.0 / 255.0,
                        26.0 / 255.0,
                        39.0 / 255.0,
                        1.0,
                    );
                    ns_window.setBackgroundColor(bg_color.downcast_ref());
                }
            }

            #[cfg(target_os = "windows")]
            {
                use windows::Win32::Foundation::COLORREF;
                use windows::Win32::Graphics::Dwm::{
                    DwmSetWindowAttribute, DWMWA_CAPTION_COLOR, DWMWA_USE_IMMERSIVE_DARK_MODE,
                };
                let hwnd = window.hwnd().unwrap();
                unsafe {
                    let use_dark_mode: i32 = 1;
                    let _ = DwmSetWindowAttribute(
                        hwnd,
                        DWMWA_USE_IMMERSIVE_DARK_MODE,
                        &use_dark_mode as *const i32 as *const std::ffi::c_void,
                        std::mem::size_of::<i32>() as u32,
                    );
                    // RGB(20, 26, 39) -> COLORREF 0x00BBGGRR = 0x00271A14
                    let caption_color = COLORREF(0x00271A14);
                    let _ = DwmSetWindowAttribute(
                        hwnd,
                        DWMWA_CAPTION_COLOR,
                        &caption_color as *const COLORREF as *const std::ffi::c_void,
                        std::mem::size_of::<COLORREF>() as u32,
                    );
                }
            }

            #[cfg(debug_assertions)]
            window.open_devtools();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
