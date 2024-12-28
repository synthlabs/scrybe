use scrybe_core::{
    audio::AudioManager,
    whisper::{Batch, Params, WhisperManager},
};
use std::{
    env,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, State};
use ts_rs::TS;
use warp::Filter;

static MODEL_PATH: &str = "../rust/models/ggml-large-v3-turbo-q8_0.bin";

#[tauri::command(rename_all = "snake_case")]
fn set_params(
    state: State<'_, Mutex<WhisperManager>>,
    translate: bool,
    suppress_blanks: bool,
    print_special: bool,
    print_progress: bool,
    token_timestamps: bool,
    single_segment: bool,
    split_on_word: bool,
    tdrz_enable: bool,
    language: String,
) {
    let mut whisper_manager = state.lock().unwrap();

    println!("setting params");
    whisper_manager.set_params(Params {
        translate,
        suppress_blanks,
        print_special,
        print_progress,
        token_timestamps,
        single_segment,
        split_on_word,
        tdrz_enable,
        language,
    });
}

#[tauri::command]
fn get_appstate(app_state: State<'_, Mutex<AppState>>) -> AppState {
    app_state.lock().unwrap().clone()
}

#[tauri::command]
fn stop_transcribe(app_state: State<'_, Mutex<AppState>>) {
    let mut state = app_state.lock().unwrap();
    state.running = false;
}

#[tauri::command]
async fn start_transcribe(
    app: AppHandle,
    wm_state: State<'_, Mutex<WhisperManager>>,
    app_state: State<'_, Mutex<AppState>>,
) -> Result<(), ()> {
    let writer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut audio_manager =
        AudioManager::new(writer.clone()).expect("unable to create audio manager");

    if let Ok(mut state) = app_state.lock() {
        state.running = true;
    }

    println!("Begin recording...");

    audio_manager.play_stream().expect("unable play stream");

    loop {
        println!("checking running status");

        if let Ok(state) = app_state.lock() {
            if !state.running {
                println!("stopping");
                break;
            }
        }

        println!("recording");
        std::thread::sleep(std::time::Duration::from_secs(2));

        let mut samples: Vec<f32> = Vec::new();
        println!("copying buffer");
        if let Ok(mut guard) = writer.lock() {
            samples.append(&mut guard);
        }
        println!("processing {}", samples.len());

        {
            println!("getting whisper manager");
            let mut whisper_manager = wm_state.lock().unwrap();

            let segments = match whisper_manager.process_samples(samples.clone()) {
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

#[derive(Debug, Default, serde::Serialize, Clone, TS)]
#[ts(export)]
struct AppState {
    pub running: bool,
    pub current_device: AudioDevice,
}

#[derive(Debug, Default, serde::Serialize, Clone, TS)]
#[ts(export)]
struct AudioDevice {
    pub name: String,
    pub id: String,
}

pub fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!("{}, {argv:?}, {cwd}", app.package_info().name);
            app.emit("single-instance", argv).unwrap();
        }))
        .setup(|app| {
            let working_dir = env::current_dir().expect("unable to get working dir");
            println!("Current working dir {}", working_dir.display());
            println!("Model path {}", MODEL_PATH);

            println!("creating whisper context");

            let whisper_manager = WhisperManager::new(MODEL_PATH, true).unwrap();

            app.manage(Mutex::new(whisper_manager));
            app.manage(Mutex::new(AppState::default()));

            let _server_handle = tauri::async_runtime::spawn(async move {
                // Match any request and return hello world!
                let routes = warp::any().map(|| "Hello, World!");

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
            get_appstate,
            set_params,
            start_transcribe,
            stop_transcribe
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
