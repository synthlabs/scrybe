use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, Host, Sample, Stream, SupportedStreamConfig};
use std::sync::{Arc, Mutex};

pub struct AudioManager {
    _host: Host,
    _device: Device,
    _config: SupportedStreamConfig,
    stream: Stream,
}

impl AudioManager {
    pub fn new(buffer: Arc<Mutex<Vec<f32>>>) -> Result<Self, anyhow::Error> {
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
            _device: device,
            _config: config,
            stream,
        })
    }

    pub fn play_stream(&mut self) -> Result<(), anyhow::Error> {
        self.stream.play()?;
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
        let resampled_stereo: Vec<f32> =
            Self::audio_resample(&samples, sample_rate, 16000, channels);

        let mut resampled_mono =
            whisper_rs::convert_stereo_to_mono_audio(&resampled_stereo).unwrap();

        if let Ok(mut guard) = buffer.lock() {
            guard.append(&mut resampled_mono);
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
