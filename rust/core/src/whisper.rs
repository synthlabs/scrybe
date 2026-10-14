#[cfg(feature = "whisper-runtime")]
use crate::audio::Cancellation;
#[cfg(feature = "whisper-runtime")]
use std::{
    sync::atomic::Ordering,
    time::{Instant, SystemTime},
};

#[cfg(feature = "whisper-runtime")]
use tracing::debug;
#[cfg(feature = "whisper-runtime")]
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperVadContext,
    WhisperVadContextParams, WhisperVadParams,
};

#[cfg(feature = "whisper-runtime")]
use crate::audio::WHISPER_SAMPLE_RATE;

#[cfg(feature = "whisper-runtime")]
fn is_cancelled(cancelled: Option<&Cancellation>) -> bool {
    cancelled.is_some_and(|cancelled| cancelled.load(Ordering::Acquire))
}

#[cfg(feature = "whisper-runtime")]
unsafe extern "C" fn abort_inference(data: *mut std::ffi::c_void) -> bool {
    // Installed only with a live AtomicBool; the callback does not access Whisper state.
    let cancelled =
        unsafe { &*data.cast::<std::sync::atomic::AtomicBool>() }.load(Ordering::Acquire);
    #[cfg(test)]
    if cancelled {
        cancellation_tests::NATIVE_ABORT_OBSERVED.store(true, Ordering::Release);
    }
    cancelled
}

const VAD_MIN_SPEECH_DURATION_MS: i32 = 250;
const VAD_MIN_SILENCE_DURATION_MS: i32 = 100;
const VAD_SPEECH_PAD_MS: i32 = 30;
const VAD_SEGMENT_OVERLAP_SECONDS: f32 = 0.1;
const VAD_SEPARATOR_SECONDS: f32 = 0.1;

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WhisperText {
    pub index: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub text: String,
    pub detected_language: Option<String>,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WhisperSegment {
    pub id: String,
    pub index: u64,
    pub items: Vec<WhisperText>,
}

#[derive(
    Debug, Default, serde::Serialize, serde::Deserialize, Clone, Copy, PartialEq, Eq, specta::Type,
)]
#[serde(rename_all = "snake_case")]
pub enum VadSensitivity {
    Sensitive,
    #[default]
    Balanced,
    Strict,
}

impl VadSensitivity {
    pub fn threshold(self) -> f32 {
        match self {
            Self::Sensitive => 0.35,
            Self::Balanced => 0.50,
            Self::Strict => 0.65,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct HallucinationProtectionConfig {
    pub enabled: bool,
    pub sensitivity: VadSensitivity,
}

impl Default for HallucinationProtectionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            sensitivity: VadSensitivity::Balanced,
        }
    }
}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct WhisperProcessEvidence {
    pub protection_enabled: bool,
    pub vad_available: bool,
    pub vad_speech_detected: Option<bool>,
    pub vad_threshold: Option<f32>,
    pub vad_mean_probability: Option<f32>,
    pub vad_speech_ratio: Option<f32>,
    pub vad_ms: f64,
    pub whisper_ms: f64,
    pub whisper_ran: bool,
    pub no_speech_probability: Option<f32>,
    pub vad_error: Option<String>,
}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct WhisperProcessResult {
    pub items: Vec<WhisperText>,
    pub evidence: WhisperProcessEvidence,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, PartialEq, specta::Type)]
#[serde(default)]
pub struct WhisperParams {
    pub toggles: WhisperToggles,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, specta::Type)]
#[serde(default)]
pub struct WhisperToggles {
    pub suppress_blanks: bool,
    pub print_special: bool,
    pub print_progress: bool,
    pub token_timestamps: bool,
    pub single_segment: bool,
    pub split_on_word: bool,
    pub tdrz_enable: bool,
}

impl Default for WhisperToggles {
    fn default() -> Self {
        Self {
            suppress_blanks: true,
            print_special: false,
            print_progress: false,
            token_timestamps: true,
            single_segment: true,
            split_on_word: false,
            tdrz_enable: false,
        }
    }
}

#[cfg(feature = "whisper-runtime")]
pub struct WhisperManager {
    ctx: WhisperContext,
    vad_ctx: Option<WhisperVadContext>,
    last_prompt: String,
    segment_index: u64,
}

#[cfg(feature = "whisper-runtime")]
#[derive(Debug)]
struct PreparedVadAudio {
    samples: Vec<f32>,
    mapping: Vec<VadTimeMapping>,
    mean_probability: Option<f32>,
    speech_ratio: f32,
}

#[cfg(feature = "whisper-runtime")]
#[derive(Debug, Clone, Copy)]
struct VadTimeMapping {
    processed_cs: f32,
    original_cs: f32,
}

#[cfg(feature = "whisper-runtime")]
impl WhisperManager {
    pub fn new(model_path: &str, use_gpu: bool) -> Result<Self, anyhow::Error> {
        Self::new_with_vad(model_path, use_gpu, None)
    }

    pub fn new_with_vad(
        model_path: &str,
        use_gpu: bool,
        vad_model_path: Option<&str>,
    ) -> Result<Self, anyhow::Error> {
        whisper_rs::install_logging_hooks();
        debug!(
            "whisper.cpp system info: {}",
            whisper_rs::print_system_info()
        );
        debug!("creating whisper context with use_gpu={}", use_gpu);

        let mut params = WhisperContextParameters::default();
        params.use_gpu = use_gpu;

        let ctx = WhisperContext::new_with_params(model_path, params)?;
        let vad_ctx = vad_model_path
            .map(|path| WhisperVadContext::new(path, WhisperVadContextParams::default()))
            .transpose()?;

        Ok(WhisperManager {
            ctx,
            vad_ctx,
            last_prompt: "".to_owned(),
            segment_index: 0,
        })
    }

    pub fn vad_available(&self) -> bool {
        self.vad_ctx.is_some()
    }

    pub fn process_samples(
        &mut self,
        samples: Vec<f32>,
        params: WhisperParams,
    ) -> Result<Vec<WhisperText>, anyhow::Error> {
        Ok(self
            .process_samples_with_protection(
                samples,
                params,
                HallucinationProtectionConfig {
                    enabled: false,
                    ..HallucinationProtectionConfig::default()
                },
            )?
            .items)
    }

    pub fn process_samples_with_protection(
        &mut self,
        samples: Vec<f32>,
        params: WhisperParams,
        protection: HallucinationProtectionConfig,
    ) -> Result<WhisperProcessResult, anyhow::Error> {
        self.process_samples_inner(samples, params, protection, None)
            .map(|result| result.expect("non-cancellable inference cannot be cancelled"))
    }

    pub fn process_samples_with_protection_cancellable(
        &mut self,
        samples: Vec<f32>,
        params: WhisperParams,
        protection: HallucinationProtectionConfig,
        cancelled: &Cancellation,
    ) -> Result<Option<WhisperProcessResult>, anyhow::Error> {
        self.process_samples_inner(samples, params, protection, Some(cancelled))
    }

    fn process_samples_inner(
        &mut self,
        samples: Vec<f32>,
        params: WhisperParams,
        protection: HallucinationProtectionConfig,
        cancelled: Option<&Cancellation>,
    ) -> Result<Option<WhisperProcessResult>, anyhow::Error> {
        if is_cancelled(cancelled) {
            return Ok(None);
        }
        let mut evidence = WhisperProcessEvidence {
            protection_enabled: protection.enabled,
            vad_available: self.vad_ctx.is_some(),
            vad_threshold: protection
                .enabled
                .then(|| protection.sensitivity.threshold()),
            ..WhisperProcessEvidence::default()
        };

        let (inference_samples, mapping) = if protection.enabled {
            let vad_started = Instant::now();
            match self.prepare_vad_audio(&samples, protection.sensitivity) {
                Ok(Some(prepared)) => {
                    evidence.vad_ms = elapsed_ms(vad_started.elapsed());
                    evidence.vad_speech_detected = Some(true);
                    evidence.vad_mean_probability = prepared.mean_probability;
                    evidence.vad_speech_ratio = Some(prepared.speech_ratio);
                    (prepared.samples, prepared.mapping)
                }
                Ok(None) if self.vad_ctx.is_some() => {
                    evidence.vad_ms = elapsed_ms(vad_started.elapsed());
                    evidence.vad_speech_detected = Some(false);
                    evidence.vad_speech_ratio = Some(0.0);
                    return Ok((!is_cancelled(cancelled)).then_some(WhisperProcessResult {
                        items: Vec::new(),
                        evidence,
                    }));
                }
                Ok(None) => (samples, Vec::new()),
                Err(err) => {
                    evidence.vad_ms = elapsed_ms(vad_started.elapsed());
                    evidence.vad_available = false;
                    evidence.vad_error = Some(err.to_string());
                    (samples, Vec::new())
                }
            }
        } else {
            (samples, Vec::new())
        };

        if is_cancelled(cancelled) {
            return Ok(None);
        }
        let whisper_started = Instant::now();
        let result = self.transcribe_samples(&inference_samples, params, &mapping, cancelled);
        if is_cancelled(cancelled) {
            return Ok(None);
        }
        let (items, no_speech_probability) = result?;
        evidence.whisper_ms = elapsed_ms(whisper_started.elapsed());
        evidence.whisper_ran = true;
        evidence.no_speech_probability = no_speech_probability;

        Ok(Some(WhisperProcessResult { items, evidence }))
    }

    fn transcribe_samples(
        &mut self,
        samples: &[f32],
        params: WhisperParams,
        mapping: &[VadTimeMapping],
        cancelled: Option<&Cancellation>,
    ) -> Result<(Vec<WhisperText>, Option<f32>), anyhow::Error> {
        let mut full_params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        if let Some(cancelled) = cancelled {
            // The borrowed Arc keeps this atomic alive until the synchronous native call returns.
            unsafe {
                full_params.set_abort_callback(Some(abort_inference));
                full_params.set_abort_callback_user_data(
                    std::sync::Arc::as_ptr(cancelled).cast_mut().cast(),
                );
            }
        }

        debug!("params: {:#?}", params);

        full_params.set_suppress_blank(params.toggles.suppress_blanks);
        full_params.set_print_special(params.toggles.print_special);
        full_params.set_print_progress(params.toggles.print_progress);
        full_params.set_token_timestamps(params.toggles.token_timestamps);
        full_params.set_single_segment(params.toggles.single_segment);
        full_params.set_split_on_word(params.toggles.split_on_word);
        full_params.set_tdrz_enable(params.toggles.tdrz_enable);
        full_params.set_translate(false);
        full_params.set_language(None);

        // if !self.last_prompt.is_empty() {
        //     full_params.set_initial_prompt(&self.last_prompt.clone());
        // }

        let start = SystemTime::now();

        let mut state = self.ctx.create_state().expect("failed to create state");
        if is_cancelled(cancelled) {
            return Ok((Vec::new(), None));
        }
        state.full(full_params, samples)?;
        if is_cancelled(cancelled) {
            return Ok((Vec::new(), None));
        }
        let detected_language =
            whisper_rs::get_lang_str(state.full_lang_id_from_state()).map(str::to_owned);

        let end = SystemTime::now();

        debug!(
            "Inference took {}ms",
            end.duration_since(start).unwrap().as_millis()
        );

        let mut segments: Vec<WhisperText> = Vec::new();
        let mut no_speech_probability: Option<f32> = None;
        for segment in state.as_iter() {
            let segment_text = segment.to_str()?;
            let start_time = map_vad_timestamp(segment.start_timestamp(), mapping);
            let end_time = map_vad_timestamp(segment.end_timestamp(), mapping);
            let segment_no_speech_probability = segment.no_speech_probability();
            no_speech_probability = Some(
                no_speech_probability
                    .map(|current| current.max(segment_no_speech_probability))
                    .unwrap_or(segment_no_speech_probability),
            );
            segments.push(WhisperText {
                index: self.segment_index,
                start_time,
                end_time,
                text: segment_text.to_string(),
                detected_language: detected_language.clone(),
            });

            debug!("{}", segment_text);

            let new_prompt = segment_text.to_string();
            if new_prompt != self.last_prompt {
                self.last_prompt = new_prompt;
            } else {
                self.last_prompt = "".to_owned();
            }
            self.segment_index += 1;
            // TODO: format those as json

            if segment.next_segment_speaker_turn() {
                segments.push(WhisperText {
                    index: 0,
                    start_time: 0,
                    end_time: 0,
                    text: "<Speaker change>".to_owned(),
                    detected_language: None,
                });
            }
        }

        Ok((segments, no_speech_probability))
    }

    fn prepare_vad_audio(
        &mut self,
        samples: &[f32],
        sensitivity: VadSensitivity,
    ) -> Result<Option<PreparedVadAudio>, anyhow::Error> {
        let Some(vad_ctx) = self.vad_ctx.as_mut() else {
            return Ok(None);
        };

        vad_ctx.detect_speech(samples)?;
        let probabilities = vad_ctx.probabilities().to_vec();
        let mut vad_params = WhisperVadParams::default();
        vad_params.set_threshold(sensitivity.threshold());
        vad_params.set_min_speech_duration(VAD_MIN_SPEECH_DURATION_MS);
        vad_params.set_min_silence_duration(VAD_MIN_SILENCE_DURATION_MS);
        vad_params.set_speech_pad(VAD_SPEECH_PAD_MS);
        vad_params.set_samples_overlap(VAD_SEGMENT_OVERLAP_SECONDS);
        let segments = vad_ctx.segments_from_probabilities(vad_params)?;

        if segments.num_segments() == 0 {
            return Ok(None);
        }

        let ranges = (0..segments.num_segments())
            .filter_map(|index| segments.get_segment(index))
            .map(|segment| {
                let start = centiseconds_to_samples(segment.start).min(samples.len());
                let end = centiseconds_to_samples(segment.end).min(samples.len());
                (start, end, segment.start, segment.end)
            })
            .filter(|(start, end, _, _)| end > start)
            .collect::<Vec<_>>();

        if ranges.is_empty() {
            return Ok(None);
        }

        let overlap_samples = seconds_to_samples(VAD_SEGMENT_OVERLAP_SECONDS);
        let separator_samples = seconds_to_samples(VAD_SEPARATOR_SECONDS);
        let mut filtered = Vec::new();
        let mut mapping = Vec::new();
        let mut speech_samples = 0usize;

        for (index, (start, end, original_start_cs, original_end_cs)) in ranges.iter().enumerate() {
            let extended_end = if index + 1 < ranges.len() {
                end.saturating_add(overlap_samples).min(samples.len())
            } else {
                *end
            };
            let processed_start_cs = samples_to_centiseconds(filtered.len());
            filtered.extend_from_slice(&samples[*start..extended_end]);
            speech_samples += end - start;
            let processed_end_cs = samples_to_centiseconds(filtered.len());
            mapping.push(VadTimeMapping {
                processed_cs: processed_start_cs,
                original_cs: *original_start_cs,
            });
            mapping.push(VadTimeMapping {
                processed_cs: processed_end_cs,
                original_cs: *original_end_cs,
            });

            if index + 1 < ranges.len() {
                let gap_start_cs = samples_to_centiseconds(filtered.len());
                filtered.resize(filtered.len() + separator_samples, 0.0);
                let gap_end_cs = samples_to_centiseconds(filtered.len());
                mapping.push(VadTimeMapping {
                    processed_cs: gap_start_cs,
                    original_cs: *original_end_cs,
                });
                mapping.push(VadTimeMapping {
                    processed_cs: gap_end_cs,
                    original_cs: ranges[index + 1].2,
                });
            }
        }

        mapping.sort_by(|left, right| left.processed_cs.total_cmp(&right.processed_cs));
        let mean_probability = mean_speech_probability(&probabilities, samples.len(), &ranges);
        let speech_ratio = speech_samples as f32 / samples.len().max(1) as f32;

        Ok(Some(PreparedVadAudio {
            samples: filtered,
            mapping,
            mean_probability,
            speech_ratio,
        }))
    }
}

#[cfg(feature = "whisper-runtime")]
fn mean_speech_probability(
    probabilities: &[f32],
    sample_count: usize,
    ranges: &[(usize, usize, f32, f32)],
) -> Option<f32> {
    if probabilities.is_empty() || sample_count == 0 {
        return None;
    }

    let samples_per_probability = sample_count.div_ceil(probabilities.len());
    let selected = probabilities
        .iter()
        .enumerate()
        .filter_map(|(index, probability)| {
            let center = index
                .saturating_mul(samples_per_probability)
                .saturating_add(samples_per_probability / 2);
            ranges
                .iter()
                .any(|(start, end, _, _)| center >= *start && center < *end)
                .then_some(*probability)
        })
        .collect::<Vec<_>>();

    (!selected.is_empty()).then(|| selected.iter().sum::<f32>() / selected.len() as f32)
}

#[cfg(feature = "whisper-runtime")]
fn map_vad_timestamp(timestamp: i64, mapping: &[VadTimeMapping]) -> i64 {
    if mapping.is_empty() {
        return timestamp;
    }

    let timestamp = timestamp as f32;
    let upper_index = mapping.partition_point(|point| point.processed_cs <= timestamp);
    if upper_index == 0 {
        return mapping[0].original_cs.round() as i64;
    }
    if upper_index >= mapping.len() {
        return mapping.last().unwrap().original_cs.round() as i64;
    }

    let lower = mapping[upper_index - 1];
    let upper = mapping[upper_index];
    let processed_span = upper.processed_cs - lower.processed_cs;
    if processed_span <= f32::EPSILON {
        return upper.original_cs.round() as i64;
    }

    let ratio = (timestamp - lower.processed_cs) / processed_span;
    (lower.original_cs + ratio * (upper.original_cs - lower.original_cs)).round() as i64
}

#[cfg(feature = "whisper-runtime")]
fn centiseconds_to_samples(timestamp: f32) -> usize {
    (timestamp.max(0.0) * WHISPER_SAMPLE_RATE as f32 / 100.0).round() as usize
}

#[cfg(feature = "whisper-runtime")]
fn samples_to_centiseconds(samples: usize) -> f32 {
    samples as f32 * 100.0 / WHISPER_SAMPLE_RATE as f32
}

#[cfg(feature = "whisper-runtime")]
fn seconds_to_samples(seconds: f32) -> usize {
    (seconds * WHISPER_SAMPLE_RATE as f32).round() as usize
}

#[cfg(feature = "whisper-runtime")]
fn elapsed_ms(duration: std::time::Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

#[cfg(all(test, feature = "whisper-runtime"))]
mod runtime_tests {
    use super::*;

    #[test]
    fn vad_sensitivity_thresholds_are_ordered() {
        assert!(VadSensitivity::Sensitive.threshold() < VadSensitivity::Balanced.threshold());
        assert!(VadSensitivity::Balanced.threshold() < VadSensitivity::Strict.threshold());
    }

    #[test]
    fn maps_processed_timestamps_back_to_original_audio() {
        let mapping = [
            VadTimeMapping {
                processed_cs: 0.0,
                original_cs: 100.0,
            },
            VadTimeMapping {
                processed_cs: 100.0,
                original_cs: 200.0,
            },
        ];

        assert_eq!(map_vad_timestamp(50, &mapping), 150);
    }

    #[test]
    fn averages_probabilities_inside_speech_ranges() {
        let ranges = [(4, 12, 0.0, 0.0)];
        let mean = mean_speech_probability(&[0.1, 0.6, 0.8, 0.2], 16, &ranges);

        assert!((mean.unwrap() - 0.7).abs() < f32::EPSILON * 2.0);
    }
}

#[cfg(test)]
mod compatibility_tests {
    use super::*;

    #[test]
    fn legacy_caption_items_without_language_remain_readable() {
        let item: WhisperText =
            serde_json::from_str(r#"{"index":3,"start_time":10,"end_time":50,"text":"hello"}"#)
                .unwrap();
        assert_eq!(item.text, "hello");
        assert_eq!(item.detected_language, None);
    }

    #[test]
    fn language_metadata_survives_segment_replacement_and_serialization() {
        let mut accumulator =
            crate::segments::SegmentAccumulator::new("fixture", std::time::Duration::from_secs(15));
        let segment = accumulator.replace_items(vec![WhisperText {
            text: "Привет".to_owned(),
            detected_language: Some("ru".to_owned()),
            ..WhisperText::default()
        }]);
        let wire = serde_json::to_string(&segment).unwrap();
        let restored: WhisperSegment = serde_json::from_str(&wire).unwrap();
        assert_eq!(restored.items[0].detected_language.as_deref(), Some("ru"));
        assert_eq!(restored.items[0].text, "Привет");
    }
}

#[cfg(all(test, feature = "whisper-runtime"))]
mod cancellation_tests {
    use super::*;
    use std::sync::{atomic::AtomicBool, Arc};

    pub(super) static NATIVE_ABORT_OBSERVED: AtomicBool = AtomicBool::new(false);

    #[test]
    #[ignore = "requires SCRYBE_TEST_MODEL; run pnpm test:inference"]
    fn native_inference_stops_after_cancellation() {
        let model =
            std::env::var("SCRYBE_TEST_MODEL").expect("Set SCRYBE_TEST_MODEL to a local model");
        let mut manager = WhisperManager::new(&model, false).unwrap();
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/transcription/basic_en_short.wav");
        let mut reader = hound::WavReader::open(fixture).unwrap();
        let sample_rate = reader.spec().sample_rate;
        assert_eq!(reader.spec().channels, 1);
        let speech: Vec<f32> = reader
            .samples::<i16>()
            .map(|sample| sample.unwrap() as f32 / i16::MAX as f32)
            .collect();
        let speech = crate::audio::resample_audio(&speech, sample_rate, WHISPER_SAMPLE_RATE, 1);
        let samples = speech
            .iter()
            .copied()
            .cycle()
            .take(30 * WHISPER_SAMPLE_RATE as usize)
            .collect();
        let cancelled = Arc::new(AtomicBool::new(false));
        let signal = cancelled.clone();
        NATIVE_ABORT_OBSERVED.store(false, Ordering::Release);
        let cancel = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let at = Instant::now();
            signal.store(true, Ordering::Release);
            at
        });
        let result = manager.process_samples_with_protection_cancellable(
            samples,
            WhisperParams::default(),
            HallucinationProtectionConfig {
                enabled: false,
                ..Default::default()
            },
            &cancelled,
        );
        let returned = Instant::now();
        let elapsed = returned.saturating_duration_since(cancel.join().unwrap());
        assert!(
            NATIVE_ABORT_OBSERVED.load(Ordering::Acquire),
            "Native inference did not observe cancellation"
        );
        assert!(
            result.unwrap().is_none(),
            "Cancelled inference returned captions"
        );
        println!("Native inference cancelled in {elapsed:?}; no captions returned");
    }

    #[test]
    fn native_abort_callback_observes_cancellation_without_owning_the_token() {
        let cancelled = Arc::new(AtomicBool::new(false));
        let data = Arc::as_ptr(&cancelled).cast_mut().cast();
        assert!(!unsafe { abort_inference(data) });
        cancelled.store(true, Ordering::Release);
        assert!(unsafe { abort_inference(data) });
        assert_eq!(Arc::strong_count(&cancelled), 1);
        assert!(is_cancelled(Some(&cancelled)));
        assert!(!is_cancelled(None));
    }
}
