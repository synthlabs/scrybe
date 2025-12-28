use anyhow::anyhow;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Host, Sample, Stream, SupportedStreamConfig};
use std::sync::{Arc, Mutex};
use tracing::{debug, error, info};

use crate::devices::AudioDevice;

pub fn avg_threshold(samples: &[f32]) -> f32 {
    let sum: f32 = samples.iter().map(|&x| x.abs()).sum();
    sum / samples.len() as f32
}

pub fn trim_silence(samples: &mut Vec<f32>, threshold: f32) {
    // Find start and end positions
    let start = samples.iter().position(|&x| x.abs() >= threshold);
    let end = samples.iter().rposition(|&x| x.abs() >= threshold);

    match (start, end) {
        (Some(s), Some(e)) => {
            // Truncate from the end first
            samples.truncate(e + 1);
            // Remove leading silence
            samples.drain(0..s);
        }
        // Handle all-silent or empty cases
        _ => samples.clear(),
    }
}

pub fn get_default_input_device() -> Result<Device, anyhow::Error> {
    let host = cpal::default_host();
    let device = host.default_input_device().unwrap();

    Ok(device)
}

pub fn get_default_output_device() -> Result<Device, anyhow::Error> {
    let host = cpal::default_host();
    let device = host.default_output_device().unwrap();

    Ok(device)
}

pub fn get_devices() -> Result<Vec<AudioDevice>, anyhow::Error> {
    let host = cpal::default_host();
    get_devices_with_host(host)
}

pub fn get_devices_with_host(host: Host) -> Result<Vec<AudioDevice>, anyhow::Error> {
    let raw_devices = host.devices()?;

    let devices: Vec<AudioDevice> = raw_devices
        .into_iter()
        .filter_map(|d| {
            let id = match d.id() {
                Ok(id) => id,
                Err(err) => {
                    error!("failed to get device id: {}", err.to_string());
                    return None;
                }
            };
            let description = match d.description() {
                Ok(description) => description,
                Err(err) => {
                    error!("failed to get device description: {}", err.to_string());
                    return None;
                }
            };
            Some(AudioDevice {
                id: id.to_string(),
                name: description.name().to_string(),
            })
        })
        .collect();

    Ok(devices)
}

pub fn get_raw_device(id: String) -> Result<Device, anyhow::Error> {
    let host = cpal::default_host();
    get_raw_device_with_host(id, host)
}

pub fn get_raw_device_with_host(id: String, host: Host) -> Result<Device, anyhow::Error> {
    let raw_devices = host.devices()?;

    let device = raw_devices.into_iter().find(|d| {
        if let Ok(d_id) = d.id() {
            return d_id.to_string().eq(&id);
        }
        false
    });

    match device {
        Some(device) => Ok(device),
        None => Err(anyhow!("unable to find device: id={}", id)),
    }
}

pub struct AudioManager {
    _host: Host,
    _device: Device,
    _config: SupportedStreamConfig,
    stream: Stream,
}

impl AudioManager {
    pub fn new_with_default_input(buffer: Arc<Mutex<Vec<f32>>>) -> Result<Self, anyhow::Error> {
        let device = get_default_input_device()?;

        Self::new(buffer, device)
    }

    pub fn new_with_default_output(buffer: Arc<Mutex<Vec<f32>>>) -> Result<Self, anyhow::Error> {
        let device = get_default_output_device()?;

        Self::new(buffer, device)
    }

    pub fn new_with_device(
        buffer: Arc<Mutex<Vec<f32>>>,
        audio_device: AudioDevice,
    ) -> Result<Self, anyhow::Error> {
        debug!(
            "creating audio manager with device={:?}",
            audio_device.clone()
        );
        let raw_device = get_raw_device(audio_device.id.clone())?;

        Self::new(buffer, raw_device)
    }

    pub fn new(buffer: Arc<Mutex<Vec<f32>>>, raw_device: Device) -> Result<Self, anyhow::Error> {
        debug!("input device: {:?}", raw_device.description()?);

        let host = cpal::default_host();

        // TODO: for now we just default to trying as input first then output
        let config = match raw_device.default_input_config() {
            Ok(conf) => conf,
            Err(err) => {
                debug!(
                    "failed to get input config, trying output config: {}",
                    err.to_string()
                );
                raw_device.default_output_config()?
            }
        };

        debug!("stream config: {:?}", config);

        let err_fn = move |err| {
            error!("an error occurred on stream: {}", err);
        };

        let sample_rate = config.sample_rate();
        let channels = config.channels();

        let stream = match config.sample_format() {
            cpal::SampleFormat::I8 => raw_device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i8, i8>(data, buffer.clone(), sample_rate, channels)
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I16 => raw_device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i16, i16>(data, buffer.clone(), sample_rate, channels)
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I32 => raw_device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i32, i32>(data, buffer.clone(), sample_rate, channels)
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::F32 => raw_device.build_input_stream(
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
            _device: raw_device.clone(),
            _config: config.clone(),
            stream,
        })
    }

    pub fn play_stream(&mut self) -> Result<(), anyhow::Error> {
        self.stream.play()?;
        info!("stream started");
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
            // todo!("support resampling to mono audio");
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
            sample_rate: config.sample_rate() as _,
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
