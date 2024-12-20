use scrybe_core::{
    audio::AudioManager,
    whisper::{Batch, WhisperManager},
};
use std::{
    env,
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter};
use warp::Filter;

static MODEL_PATH: &str = "../rust/models/ggml-large-v3-turbo-q8_0.bin";

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn subtitle(app: AppHandle) {
    let writer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut audio_manager =
        AudioManager::new(writer.clone()).expect("unable to create audio manager");

    let working_dir = env::current_dir().expect("unable to get working dir");
    println!("Current working dir {}", working_dir.display());
    println!("Model path {}", MODEL_PATH);

    println!("creating whisper context");

    let mut whisper_manager = match WhisperManager::new(MODEL_PATH, true) {
        Ok(manager) => manager,
        Err(err) => {
            println!("{}", err);
            return;
        }
    };

    println!("Begin recording...");

    audio_manager.play_stream().expect("unable play stream");

    loop {
        println!("recording");

        std::thread::sleep(std::time::Duration::from_secs(2));

        let mut samples: Vec<f32> = Vec::new();
        println!("copying buffer");
        if let Ok(mut guard) = writer.lock() {
            samples.append(&mut guard);
        }
        println!("processing {}", samples.len());

        let segments = match whisper_manager.process_samples(samples.clone()) {
            Ok(segments) => segments,
            Err(err) => {
                println!("ERROR {}", err);
                continue;
            }
        };

        app.emit("new_batch", Batch { segments })
            .expect("failed to emit event");

        println!(
            "trimming samples, total {}, removing {}",
            samples.len(),
            (samples.len() - 2000)
        );

        // leave the last half second of the previous sample
        let _ = samples.drain(..(samples.len() - 2000));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let _subtitle_handle = tauri::async_runtime::spawn(async move {
                println!("{:#?}", app_handle.config());
                subtitle(app_handle);
            });

            let _server_handle = tauri::async_runtime::spawn(async move {
                // Match any request and return hello world!
                let routes = warp::any().map(|| "Hello, World!");

                warp::serve(routes).run(([127, 0, 0, 1], 3030)).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
