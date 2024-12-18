pub mod audio;
pub mod whisper;

use audio::AudioManager;
use cpal::traits::{DeviceTrait, HostTrait};
use std::fs::{self};
use std::sync::{Arc, Mutex};
use whisper::WhisperManager;

fn transcribe() -> Result<(), anyhow::Error> {
    let model_file_path = fs::read_dir("./models")
        .expect("failed to read './models' folder")
        .filter_map(|entry| {
            let entry = entry.expect("failed to read entry");
            let path = entry.path();
            if path.is_file() {
                let extension = path.extension().and_then(|s| s.to_str());
                if extension == Some("bin") {
                    Some(path)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .next()
        .expect("no model file found")
        .to_str()
        .expect("invalid model file path")
        .to_string();

    let writer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut audio_manager = AudioManager::new(writer.clone())?;

    println!("Model path {}", model_file_path);

    println!("creating whisper context");

    let mut whisper_manager = WhisperManager::new(model_file_path.as_str(), true)?;

    println!("Begin recording...");

    audio_manager.play_stream()?;

    loop {
        println!("recording");
        // Let recording go for roughly 5 seconds.
        std::thread::sleep(std::time::Duration::from_secs(5));

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

        for segment in segments {
            println!("{}", segment);
        }

        println!(
            "trimming samples, total {}, removing {}",
            samples.len(),
            (samples.len() - 8000)
        );

        // leave the last half second of the previous sample
        let _ = samples.drain(..(samples.len() - 8000));
    }
}

fn _iterate_devices() -> Result<(), anyhow::Error> {
    println!("Supported hosts:\n  {:?}", cpal::ALL_HOSTS);
    let available_hosts = cpal::available_hosts();
    println!("Available hosts:\n  {:?}", available_hosts);

    for host_id in available_hosts {
        println!("{}", host_id.name());
        let host = cpal::host_from_id(host_id)?;

        let default_in = host.default_input_device().map(|e| e.name().unwrap());
        let default_out = host.default_output_device().map(|e| e.name().unwrap());
        println!("  Default Input Device:\n    {:?}", default_in);
        println!("  Default Output Device:\n    {:?}", default_out);

        let devices = host.devices()?;
        println!("  Devices: ");
        for (device_index, device) in devices.enumerate() {
            println!("  {}. \"{}\"", device_index + 1, device.name()?);

            // Input configs
            if let Ok(conf) = device.default_input_config() {
                println!("    Default input stream config:\n      {:?}", conf);
            }
            let input_configs = match device.supported_input_configs() {
                Ok(f) => f.collect(),
                Err(e) => {
                    println!("    Error getting supported input configs: {:?}", e);
                    Vec::new()
                }
            };
            if !input_configs.is_empty() {
                println!("    All supported input stream configs:");
                for (config_index, config) in input_configs.into_iter().enumerate() {
                    println!(
                        "      {}.{}. {:?}",
                        device_index + 1,
                        config_index + 1,
                        config
                    );
                }
            }

            // Output configs
            if let Ok(conf) = device.default_output_config() {
                println!("    Default output stream config:\n      {:?}", conf);
            }
            let output_configs = match device.supported_output_configs() {
                Ok(f) => f.collect(),
                Err(e) => {
                    println!("    Error getting supported output configs: {:?}", e);
                    Vec::new()
                }
            };
            if !output_configs.is_empty() {
                println!("    All supported output stream configs:");
                for (config_index, config) in output_configs.into_iter().enumerate() {
                    println!(
                        "      {}.{}. {:?}",
                        device_index + 1,
                        config_index + 1,
                        config
                    );
                }
            }
        }
    }

    Ok(())
}
