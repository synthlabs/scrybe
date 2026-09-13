use super::{
    check_startup, mono_from_interleaved, resample_audio, AudioError, AudioErrorKind, Cancellation,
    FailureHandler, WHISPER_SAMPLE_RATE,
};
use crate::devices::{AudioDevice, AudioDeviceOption, AudioSourceKind, DEFAULT_OUTPUT_ID};
use anyhow::anyhow;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Host, Sample, Stream, SupportedStreamConfig};
use std::{
    sync::{atomic::Ordering, Arc, Mutex},
    time::Instant,
};
use tracing::{debug, info};

pub(super) fn capture_error(error: anyhow::Error) -> AudioError {
    error
        .downcast::<AudioError>()
        .unwrap_or_else(|error| AudioError::new(AudioErrorKind::StreamFailed, error.to_string()))
}

fn is_default_audio_device_id(id: &str) -> bool {
    id.is_empty()
}

fn get_default_audio_device(host: &Host) -> Result<Device, anyhow::Error> {
    host.default_input_device()
        .or_else(|| {
            if cfg!(target_os = "macos") {
                host.default_output_device()
            } else {
                None
            }
        })
        .ok_or_else(|| anyhow!("no default input or output device available"))
}

pub fn get_devices() -> Result<Vec<AudioDeviceOption>, anyhow::Error> {
    let host = cpal::default_host();
    let mut options = Vec::new();
    let grouped = cfg!(target_os = "windows");
    for (id, kind, device) in [
        ("", AudioSourceKind::Input, host.default_input_device()),
        (
            DEFAULT_OUTPUT_ID,
            AudioSourceKind::Output,
            host.default_output_device(),
        ),
    ] {
        if id == DEFAULT_OUTPUT_ID && !grouped {
            continue;
        }
        options.push(AudioDeviceOption {
            id: id.into(),
            name: device
                .and_then(|d| d.description().ok())
                .map(|d| d.name().to_owned())
                .unwrap_or_default(),
            kind: grouped.then_some(kind),
            is_default: true,
        });
    }
    for device in host.devices()? {
        let (Ok(id), Ok(description)) = (device.id(), device.description()) else {
            continue;
        };
        let kind = if grouped {
            match description.direction() {
                cpal::DeviceDirection::Input => Some(AudioSourceKind::Input),
                cpal::DeviceDirection::Output => Some(AudioSourceKind::Output),
                _ => continue,
            }
        } else {
            None
        };
        options.push(AudioDeviceOption {
            id: id.to_string(),
            name: description.name().into(),
            kind,
            is_default: false,
        });
    }
    Ok(options)
}

fn get_raw_device(id: String) -> Result<Device, anyhow::Error> {
    let host = cpal::default_host();
    get_raw_device_with_host(id, host)
}

fn get_raw_device_with_host(id: String, host: Host) -> Result<Device, anyhow::Error> {
    if is_default_audio_device_id(&id) {
        return get_default_audio_device(&host);
    }

    if id == DEFAULT_OUTPUT_ID {
        return host
            .default_output_device()
            .ok_or_else(|| anyhow!("No default computer audio device is available."));
    }
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

pub struct CpalAudioManager {
    _host: Host,
    _device: Device,
    _config: SupportedStreamConfig,
    stream: Stream,
}

impl CpalAudioManager {
    pub fn new(
        buffer: Arc<Mutex<Vec<f32>>>,
        device: AudioDevice,
        cancelled: Cancellation,
        on_error: FailureHandler,
        deadline: Instant,
    ) -> Result<Self, anyhow::Error> {
        check_startup(&cancelled, deadline)?;
        let raw_device = get_raw_device(device.id)?;
        check_startup(&cancelled, deadline)?;
        debug!("input device: {:?}", raw_device.description()?);

        let host = cpal::default_host();

        // Preserve input-first capture for macOS duplex devices.
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

        check_startup(&cancelled, deadline)?;
        debug!("stream config: {:?}", config);

        let err_fn = move |err: cpal::StreamError| {
            on_error(AudioError::new(
                AudioErrorKind::StreamFailed,
                err.to_string(),
            ));
        };

        let sample_rate = config.sample_rate();
        let channels = config.channels();

        let stream = match config.sample_format() {
            cpal::SampleFormat::I8 => raw_device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i8, i8>(
                        data,
                        buffer.clone(),
                        sample_rate,
                        channels,
                        &cancelled,
                    )
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I16 => raw_device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i16, i16>(
                        data,
                        buffer.clone(),
                        sample_rate,
                        channels,
                        &cancelled,
                    )
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::I32 => raw_device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<i32, i32>(
                        data,
                        buffer.clone(),
                        sample_rate,
                        channels,
                        &cancelled,
                    )
                },
                err_fn,
                None,
            )?,
            cpal::SampleFormat::F32 => raw_device.build_input_stream(
                &config.clone().into(),
                move |data, _: &_| {
                    Self::write_input_data::<f32, f32>(
                        data,
                        buffer.clone(),
                        sample_rate,
                        channels,
                        &cancelled,
                    )
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

        Ok(CpalAudioManager {
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
        cancelled: &Cancellation,
    ) where
        T: Sample,
        U: Sample + hound::Sample + FromSample<T>,
    {
        if cancelled.load(Ordering::Acquire) {
            return;
        }
        // Convert the input samples to f32
        let samples: Vec<f32> = input
            .iter()
            .map(|s| s.to_float_sample().to_sample())
            .collect();

        // Resample the stereo audio to the desired sample rate
        let mut resampled_audio: Vec<f32> =
            resample_audio(&samples, sample_rate, WHISPER_SAMPLE_RATE, channels);

        if channels > 1 {
            resampled_audio = mono_from_interleaved(&resampled_audio, channels);
        }

        if let Ok(mut guard) = buffer.lock() {
            if !cancelled.load(Ordering::Acquire) {
                guard.append(&mut resampled_audio);
            }
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_error_kinds_survive_the_native_backend_boundary() {
        for kind in [AudioErrorKind::Timeout, AudioErrorKind::Cancelled] {
            assert_eq!(
                capture_error(AudioError::new(kind, "startup").into()).kind,
                kind
            );
        }
        assert_eq!(
            capture_error(anyhow!("native failure")).kind,
            AudioErrorKind::StreamFailed
        );
    }
}
