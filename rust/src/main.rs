use anyhow::bail;
use clap::Parser;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use whisper_rs::{
    FullParams, SamplingStrategy, SegmentCallbackData, WhisperContext, WhisperContextParameters,
};

fn transcribe() -> Result<(), anyhow::Error> {
    // Use ScreenCaptureKit host
    #[cfg(target_os = "macos")]
    let host = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?;
    #[cfg(not(target_os = "macos"))]
    let host = cpal::default_host();

    // Set up the input device and stream with the default input config.
    #[cfg(target_os = "macos")]
    let device = host
        .default_input_device()
        .expect("failed to find input device");
    #[cfg(not(target_os = "macos"))]
    let device = host
        .default_output_device()
        .expect("failed to find input device");

    println!("Input device: {}", device.name()?);

    #[cfg(target_os = "macos")]
    let config = device
        .default_input_config()
        .expect("Failed to get default input config");

    #[cfg(not(target_os = "macos"))]
    let config = device
        .default_output_config()
        .expect("Failed to get default input config");

    println!("Default config: {:?}", config);

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

    println!("Model path {}", model_file_path);

    let mut params = WhisperContextParameters::default();
    params.use_gpu = true;

    println!("creating whisper context");

    let ctx = WhisperContext::new_with_params(model_file_path.as_str(), params)
        .expect("failed to load model");

    println!("Begin recording...");

    let writer_2 = writer.clone();

    let err_fn = move |err| {
        eprintln!("an error occurred on stream: {}", err);
    };

    let sample_rate = config.sample_rate().0;
    let channels = config.channels();

    let stream = match config.sample_format() {
        cpal::SampleFormat::I8 => device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i8, i8>(data, &writer_2, sample_rate, channels),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i16, i16>(data, &writer_2, sample_rate, channels),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::I32 => device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<i32, i32>(data, &writer_2, sample_rate, channels),
            err_fn,
            None,
        )?,
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data, _: &_| write_input_data::<f32, f32>(data, &writer_2, sample_rate, channels),
            err_fn,
            None,
        )?,
        sample_format => {
            return Err(anyhow::Error::msg(format!(
                "Unsupported sample format '{sample_format}'"
            )))
        }
    };

    stream.play()?;

    loop {
        println!("recording");
        // Let recording go for roughly 5 seconds.
        std::thread::sleep(std::time::Duration::from_secs(5));

        println!("copying buffer");
        let mut samples: Vec<f32> = Vec::new();
        if let Ok(mut guard) = writer.lock() {
            samples.append(&mut guard);
        }
        println!("processing");

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_suppress_blank(false);
        params.set_print_special(false);
        params.set_print_progress(true);
        params.set_token_timestamps(true);
        params.set_split_on_word(true);
        params.set_tdrz_enable(false);
        params.set_translate(false);
        params.set_language(Some("auto"));
        params.set_duration_ms(6000);

        let mut state = ctx.create_state().expect("failed to create state");
        match state.full(params, &samples[..]) {
            Ok(_) => {}
            Err(err) => {
                println!("failed to run model {}", err);
                continue;
            }
        };

        let num_segments = state
            .full_n_segments()
            .expect("failed to get number of segments");
        for i in 0..num_segments {
            let segment = state
                .full_get_segment_text(i)
                .expect("failed to get segment");
            let start_timestamp = state
                .full_get_segment_t0(i)
                .expect("failed to get segment start timestamp");
            let end_timestamp = state
                .full_get_segment_t1(i)
                .expect("failed to get segment end timestamp");
            println!("[{} - {}]: {}", start_timestamp, end_timestamp, segment);
            // TODO: format those as json
        }
    }
}

fn sample_format(format: cpal::SampleFormat) -> hound::SampleFormat {
    if format.is_float() {
        hound::SampleFormat::Float
    } else {
        hound::SampleFormat::Int
    }
}

fn wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> hound::WavSpec {
    hound::WavSpec {
        channels: config.channels() as _,
        sample_rate: config.sample_rate().0 as _,
        bits_per_sample: (config.sample_format().sample_size() * 8) as _,
        sample_format: sample_format(config.sample_format()),
    }
}

pub fn audio_resample(data: &[f32], from_rate: u32, sample_rate: u32, channels: u16) -> Vec<f32> {
    use samplerate::{convert, ConverterType};
    convert(
        from_rate as _,
        sample_rate as _,
        channels as _,
        ConverterType::SincBestQuality,
        data,
    )
    .unwrap_or_default()
}

fn write_input_data<T, U>(
    input: &[T],
    writer: &Arc<Mutex<Vec<f32>>>,
    sample_rate: u32,
    channels: u16,
) where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T>,
{
    // Convert the input samples to f32
    let samples: Vec<f32> = input
        .iter()
        .map(|s| s.to_float_sample().to_sample())
        .collect();

    // Resample the stereo audio to the desired sample rate
    let resampled_stereo: Vec<f32> = audio_resample(&samples, sample_rate, 16000, channels);

    let mut resampled_mono = whisper_rs::convert_stereo_to_mono_audio(&resampled_stereo).unwrap();

    // Write the mono data to the WAV file
    if let Ok(mut guard) = writer.lock() {
        guard.append(&mut resampled_mono);
    }
}

fn iterate_devices() -> Result<(), anyhow::Error> {
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

fn main() -> Result<(), anyhow::Error> {
    transcribe()
}
