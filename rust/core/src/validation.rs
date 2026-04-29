use std::{fs, path::Path};

use anyhow::{anyhow, Context};
use serde::{Deserialize, Serialize};

use crate::{
    audio::{mono_from_interleaved, resample_audio, WHISPER_SAMPLE_RATE},
    whisper::{WhisperParams, WhisperText},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioFixture {
    pub samples: Vec<f32>,
    pub metadata: AudioMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMetadata {
    pub path: String,
    pub source_sample_rate: u32,
    pub source_channels: u16,
    pub source_bits_per_sample: u16,
    pub sample_count: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ExpectedTranscript {
    pub params: WhisperParams,
    pub normalized_text: String,
    pub max_word_error_rate: f32,
    pub min_segments: usize,
    pub max_segments: Option<usize>,
}

impl Default for ExpectedTranscript {
    fn default() -> Self {
        Self {
            params: WhisperParams::default(),
            normalized_text: String::new(),
            max_word_error_rate: 0.35,
            min_segments: 1,
            max_segments: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    pub audio: AudioMetadata,
    pub params: WhisperParams,
    pub items: Vec<WhisperText>,
    pub text: String,
    pub normalized_text: String,
    pub comparison: Option<TranscriptComparison>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptComparison {
    pub expected_normalized_text: String,
    pub word_distance: usize,
    pub expected_word_count: usize,
    pub actual_word_count: usize,
    pub word_error_rate: f32,
    pub segment_count: usize,
    pub min_segments: usize,
    pub max_segments: Option<usize>,
    pub passed: bool,
}

pub fn load_wav_fixture(path: impl AsRef<Path>) -> Result<AudioFixture, anyhow::Error> {
    let path = path.as_ref();
    let mut reader = hound::WavReader::open(path)
        .with_context(|| format!("failed to open WAV fixture {}", path.display()))?;
    let spec = reader.spec();

    let interleaved = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .context("failed to read float WAV samples")?,
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => reader
            .samples::<i16>()
            .map(|sample| sample.map(|s| s as f32 / i16::MAX as f32))
            .collect::<Result<Vec<_>, _>>()
            .context("failed to read 16-bit WAV samples")?,
        hound::SampleFormat::Int if spec.bits_per_sample <= 32 => {
            let scale = ((1_i64 << (spec.bits_per_sample - 1)) - 1) as f32;
            reader
                .samples::<i32>()
                .map(|sample| sample.map(|s| s as f32 / scale))
                .collect::<Result<Vec<_>, _>>()
                .context("failed to read integer WAV samples")?
        }
        _ => {
            return Err(anyhow!(
                "unsupported WAV sample format: {:?} {} bits",
                spec.sample_format,
                spec.bits_per_sample
            ))
        }
    };

    let mono = mono_from_interleaved(&interleaved, spec.channels);
    let samples = if spec.sample_rate == WHISPER_SAMPLE_RATE {
        mono
    } else {
        resample_audio(&mono, spec.sample_rate, WHISPER_SAMPLE_RATE, 1)
    };

    let duration_ms = if spec.sample_rate == 0 || spec.channels == 0 {
        0
    } else {
        ((interleaved.len() as f64 / spec.channels as f64) / spec.sample_rate as f64 * 1000.0)
            .round() as u64
    };

    Ok(AudioFixture {
        metadata: AudioMetadata {
            path: path.display().to_string(),
            source_sample_rate: spec.sample_rate,
            source_channels: spec.channels,
            source_bits_per_sample: spec.bits_per_sample,
            sample_count: samples.len(),
            duration_ms,
        },
        samples,
    })
}

pub fn read_expected(path: impl AsRef<Path>) -> Result<ExpectedTranscript, anyhow::Error> {
    let path = path.as_ref();
    let data = fs::read_to_string(path)
        .with_context(|| format!("failed to read expected transcript {}", path.display()))?;
    serde_json::from_str(&data)
        .with_context(|| format!("failed to parse expected transcript {}", path.display()))
}

pub fn write_json(path: impl AsRef<Path>, value: &impl Serialize) -> Result<(), anyhow::Error> {
    let data = serde_json::to_string_pretty(value)?;
    fs::write(path.as_ref(), format!("{data}\n"))
        .with_context(|| format!("failed to write {}", path.as_ref().display()))
}

pub fn build_report(
    audio: AudioMetadata,
    params: WhisperParams,
    items: Vec<WhisperText>,
    expected: Option<&ExpectedTranscript>,
) -> ValidationReport {
    let text = items
        .iter()
        .map(|item| item.text.as_str())
        .collect::<Vec<_>>()
        .join("");
    let normalized_text = normalize_transcript(&text);
    let comparison =
        expected.map(|expected| compare_transcript(&normalized_text, items.len(), expected));

    ValidationReport {
        audio,
        params,
        items,
        text,
        normalized_text,
        comparison,
    }
}

pub fn normalize_transcript(text: &str) -> String {
    let mut normalized = String::with_capacity(text.len());

    for ch in text.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() {
            normalized.push(ch);
        } else {
            normalized.push(' ');
        }
    }

    normalized.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn compare_transcript(
    actual_normalized: &str,
    segment_count: usize,
    expected: &ExpectedTranscript,
) -> TranscriptComparison {
    let expected_words = words(&expected.normalized_text);
    let actual_words = words(actual_normalized);
    let word_distance = levenshtein_distance(&expected_words, &actual_words);
    let denominator = expected_words.len().max(1);
    let word_error_rate = word_distance as f32 / denominator as f32;
    let min_ok = segment_count >= expected.min_segments;
    let max_ok = expected
        .max_segments
        .map(|max_segments| segment_count <= max_segments)
        .unwrap_or(true);
    let passed = word_error_rate <= expected.max_word_error_rate && min_ok && max_ok;

    TranscriptComparison {
        expected_normalized_text: expected.normalized_text.clone(),
        word_distance,
        expected_word_count: expected_words.len(),
        actual_word_count: actual_words.len(),
        word_error_rate,
        segment_count,
        min_segments: expected.min_segments,
        max_segments: expected.max_segments,
        passed,
    }
}

fn words(text: &str) -> Vec<&str> {
    text.split_whitespace().collect()
}

fn levenshtein_distance(expected: &[&str], actual: &[&str]) -> usize {
    let mut previous: Vec<usize> = (0..=actual.len()).collect();
    let mut current = vec![0; actual.len() + 1];

    for (i, expected_word) in expected.iter().enumerate() {
        current[0] = i + 1;

        for (j, actual_word) in actual.iter().enumerate() {
            let substitution = if expected_word == actual_word { 0 } else { 1 };
            current[j + 1] = (previous[j + 1] + 1)
                .min(current[j] + 1)
                .min(previous[j] + substitution);
        }

        std::mem::swap(&mut previous, &mut current);
    }

    previous[actual.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_case_punctuation_and_spacing() {
        assert_eq!(
            normalize_transcript(" Hello, SCRYBE!\nLocal-captions. "),
            "hello scrybe local captions"
        );
    }

    #[test]
    fn computes_word_error_rate() {
        let expected = ExpectedTranscript {
            normalized_text: "scrybe validates local captions".to_owned(),
            max_word_error_rate: 0.25,
            ..ExpectedTranscript::default()
        };

        let comparison = compare_transcript("scrybe validates captions", 1, &expected);

        assert_eq!(comparison.word_distance, 1);
        assert_eq!(comparison.expected_word_count, 4);
        assert_eq!(comparison.word_error_rate, 0.25);
        assert!(comparison.passed);
    }

    #[test]
    fn fails_when_segment_count_is_outside_bounds() {
        let expected = ExpectedTranscript {
            normalized_text: "hello".to_owned(),
            min_segments: 2,
            max_segments: Some(3),
            ..ExpectedTranscript::default()
        };

        let comparison = compare_transcript("hello", 1, &expected);

        assert!(!comparison.passed);
    }
}
