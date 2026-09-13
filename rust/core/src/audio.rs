use crate::devices::{AudioDevice, AudioDeviceOption};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

// Keep the shared CPAL backend type-checked by Linux test runs.
#[cfg(any(not(target_os = "linux"), test))]
#[cfg_attr(target_os = "linux", allow(dead_code))]
mod cpal;
#[cfg(target_os = "linux")]
mod pulse;

pub const WHISPER_SAMPLE_RATE: u32 = 16_000;
pub const CAPTURE_START_TIMEOUT: Duration = Duration::from_secs(5);

pub fn avg_threshold(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

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

pub fn mono_from_interleaved(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }

    samples
        .chunks(channels as usize)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect()
}

pub fn resample_audio(data: &[f32], from_rate: u32, sample_rate: u32, channels: u16) -> Vec<f32> {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum AudioErrorKind {
    ServiceUnavailable,
    DeviceUnavailable,
    UnsupportedDevice,
    StreamFailed,
    Timeout,
    Cancelled,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct AudioError {
    pub kind: AudioErrorKind,
    pub details: String,
}

impl AudioError {
    pub fn new(kind: AudioErrorKind, details: impl Into<String>) -> Self {
        Self {
            kind,
            details: details.into(),
        }
    }
}
impl std::fmt::Display for AudioError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.details)
    }
}
impl std::error::Error for AudioError {}

pub type FailureHandler = Arc<dyn Fn(AudioError) + Send + Sync>;
pub type Cancellation = Arc<AtomicBool>;

pub fn get_devices() -> Result<Vec<AudioDeviceOption>, AudioError> {
    #[cfg(target_os = "linux")]
    {
        pulse::get_devices()
    }
    #[cfg(not(target_os = "linux"))]
    {
        cpal::get_devices()
            .map_err(|e| AudioError::new(AudioErrorKind::DeviceUnavailable, e.to_string()))
    }
}

pub struct AudioManager {
    #[cfg(target_os = "linux")]
    backend: pulse::PulseCapture,
    #[cfg(not(target_os = "linux"))]
    backend: cpal::CpalAudioManager,
    cancelled: Cancellation,
    deadline: Instant,
}

impl AudioManager {
    pub fn new_with_device(
        buffer: Arc<Mutex<Vec<f32>>>,
        device: AudioDevice,
    ) -> Result<Self, AudioError> {
        Self::new_cancellable(
            buffer,
            device,
            Arc::new(AtomicBool::new(false)),
            Arc::new(|error| tracing::error!(%error, "audio capture failed")),
        )
    }

    pub fn new_cancellable(
        buffer: Arc<Mutex<Vec<f32>>>,
        device: AudioDevice,
        cancelled: Cancellation,
        on_error: FailureHandler,
    ) -> Result<Self, AudioError> {
        Self::new_with_deadline(
            buffer,
            device,
            cancelled,
            on_error,
            Instant::now() + CAPTURE_START_TIMEOUT,
        )
    }

    pub fn new_with_deadline(
        buffer: Arc<Mutex<Vec<f32>>>,
        device: AudioDevice,
        cancelled: Cancellation,
        on_error: FailureHandler,
        deadline: Instant,
    ) -> Result<Self, AudioError> {
        check_startup(&cancelled, deadline)?;
        #[cfg(target_os = "linux")]
        let backend =
            pulse::PulseCapture::new(buffer, device, cancelled.clone(), on_error, deadline)?;
        #[cfg(not(target_os = "linux"))]
        let backend =
            cpal::CpalAudioManager::new(buffer, device, cancelled.clone(), on_error, deadline)
                .map_err(cpal::capture_error)?;
        let manager = Self {
            backend,
            cancelled,
            deadline,
        };
        check_startup(&manager.cancelled, deadline)?;
        Ok(manager)
    }

    pub fn play_stream(&mut self) -> Result<(), AudioError> {
        check_startup(&self.cancelled, self.deadline)?;
        #[cfg(target_os = "linux")]
        {
            self.backend.play()?;
            check_startup(&self.cancelled, self.deadline)
        }
        #[cfg(not(target_os = "linux"))]
        {
            self.backend
                .play_stream()
                .map_err(|e| AudioError::new(AudioErrorKind::StreamFailed, e.to_string()))?;
            check_startup(&self.cancelled, self.deadline)
        }
    }
}

fn check_startup(cancelled: &Cancellation, deadline: Instant) -> Result<(), AudioError> {
    if cancelled.load(Ordering::Acquire) {
        return Err(AudioError::new(
            AudioErrorKind::Cancelled,
            "Audio capture was cancelled.",
        ));
    }
    if Instant::now() >= deadline {
        return Err(AudioError::new(
            AudioErrorKind::Timeout,
            "The audio stream did not start within five seconds.",
        ));
    }
    Ok(())
}

impl Drop for AudioManager {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_checks_cancellation_and_an_absolute_deadline() {
        let cancellation = Arc::new(AtomicBool::new(false));
        assert!(check_startup(&cancellation, Instant::now() + CAPTURE_START_TIMEOUT).is_ok());
        assert_eq!(
            check_startup(&cancellation, Instant::now())
                .unwrap_err()
                .kind,
            AudioErrorKind::Timeout
        );
        cancellation.store(true, Ordering::Release);
        assert_eq!(
            check_startup(&cancellation, Instant::now())
                .unwrap_err()
                .kind,
            AudioErrorKind::Cancelled
        );
    }

    #[test]
    fn avg_threshold_is_zero_for_empty_samples() {
        assert_eq!(avg_threshold(&[]), 0.0);
    }

    #[test]
    fn trims_leading_and_trailing_silence() {
        let mut samples = vec![0.0, 0.001, 0.02, 0.4, 0.009, 0.0];

        trim_silence(&mut samples, 0.01);

        assert_eq!(samples, vec![0.02, 0.4]);
    }

    #[test]
    fn clears_all_silent_samples() {
        let mut samples = vec![0.0, 0.001, 0.009];

        trim_silence(&mut samples, 0.01);

        assert!(samples.is_empty());
    }

    #[test]
    fn averages_interleaved_channels_to_mono() {
        let samples = mono_from_interleaved(&[1.0, -1.0, 0.25, 0.75], 2);

        assert_eq!(samples, vec![0.0, 0.5]);
    }
}
