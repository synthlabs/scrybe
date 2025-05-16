use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Host, Sample, Stream, SupportedStreamConfig};
use std::sync::{Arc, Mutex};

pub fn iterate_devices() -> Result<(), anyhow::Error> {
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

pub fn get_default_input_device(host: &Host) -> Result<Device, anyhow::Error> {
    // Set up the input device
    #[cfg(target_os = "macos")]
    let device = host
        .default_input_device()
        .expect("failed to find default input device");
    #[cfg(not(target_os = "macos"))]
    let device = host
        .default_input_device()
        .expect("failed to find default input device");

    Ok(device)
}

pub fn get_default_output_device(host: &Host) -> Result<Device, anyhow::Error> {
    // Set up the output device
    #[cfg(target_os = "macos")]
    let device = host
        .default_output_device()
        .expect("failed to find default output device");
    #[cfg(not(target_os = "macos"))]
    let device = host
        .default_output_device()
        .expect("failed to find default output device");

    Ok(device)
}

pub struct AudioManager {
    _host: Host,
    _device: Device,
    _config: SupportedStreamConfig,
    stream: Stream,
}

impl AudioManager {
    pub fn new_with_default_input(buffer: Arc<Mutex<Vec<f32>>>) -> Result<Self, anyhow::Error> {
        // // Use ScreenCaptureKit host
        // #[cfg(target_os = "macos")]
        // let host = cpal::host_from_id(cpal::HostId::ScreenCaptureKit)?;
        // #[cfg(not(target_os = "macos"))]
        let host = cpal::default_host();

        let device = get_default_input_device(&host)?;

        Self::new(buffer, host, device)
    }

    pub fn new(
        buffer: Arc<Mutex<Vec<f32>>>,
        host: Host,
        device: Device,
    ) -> Result<Self, anyhow::Error> {
        println!("Input device: {}", device.name()?);

        // #[cfg(target_os = "macos")]
        let config = device
            .default_input_config()
            .expect("Failed to get default input config");

        // #[cfg(not(target_os = "macos"))]
        // let config = device
        //     .default_output_config()
        //     .expect("Failed to get default input config");

        println!("Default config: {:?}", config);

        let err_fn = move |err| {
            eprintln!("an error occurred on stream: {}", err);
        };

        let sample_rate = config.sample_rate().0;
        let channels = config.channels();

        let stream = match config.sample_format() {
            cpal::SampleFormat::I8 => device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i8, i8>(data, buffer.clone(), sample_rate, channels)
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i16, i16>(data, buffer.clone(), sample_rate, channels)
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I32 => device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i32, i32>(data, buffer.clone(), sample_rate, channels)
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<f32, f32>(data, buffer.clone(), sample_rate, channels)
                },
                err_fn,
                None,
            )?,
            sample_format => {
                return Err(anyhow::Error::msg(format!(
                    "Unsupported sample format '{sample_format}'"
                )))
            }
        };

        Ok(AudioManager {
            _host: host,
            _device: device.clone(),
            _config: config.clone(),
            stream,
        })
    }

    pub fn play_stream(&mut self) -> Result<(), anyhow::Error> {
        self.stream.play()?;
        println!("stream started");
        Ok(())
    }

    fn write_input_data<T, U>(
        input: &[T],
        buffer: Arc<Mutex<Vec<f32>>>,
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
        let mut resampled_audio: Vec<f32> =
            Self::audio_resample(&samples, sample_rate, 16000, channels);

        if channels > 1 {
            resampled_audio = whisper_rs::convert_stereo_to_mono_audio(&resampled_audio).unwrap();
        }

        if let Ok(mut guard) = buffer.lock() {
            guard.append(&mut resampled_audio);
        }
    }

    fn _sample_format(format: cpal::SampleFormat) -> hound::SampleFormat {
        if format.is_float() {
            hound::SampleFormat::Float
        } else {
            hound::SampleFormat::Int
        }
    }

    fn _wav_spec_from_config(config: &cpal::SupportedStreamConfig) -> hound::WavSpec {
        hound::WavSpec {
            channels: config.channels() as _,
            sample_rate: config.sample_rate().0 as _,
            bits_per_sample: (config.sample_format().sample_size() * 8) as _,
            sample_format: Self::_sample_format(config.sample_format()),
        }
    }

    fn audio_resample(data: &[f32], from_rate: u32, sample_rate: u32, channels: u16) -> Vec<f32> {
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
}
