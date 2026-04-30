use std::time::{Duration, Instant};

use tracing::debug;

use crate::{
    validation::normalize_transcript,
    whisper::{WhisperSegment, WhisperText},
};

// TODO: Make segment emission gate thresholds configurable after tuning with real transcription sessions.
const DRASTIC_MIN_OLD_WORDS: usize = 4;
const DRASTIC_SHRINK_RATIO: f32 = 0.60;
const DRASTIC_EDIT_RATIO: f32 = 0.50;
const DRASTIC_MIN_EDIT_WORDS: usize = 3;

#[derive(Debug, Clone)]
pub struct SegmentAccumulator {
    current: WhisperSegment,
    segment_size: Duration,
}

impl SegmentAccumulator {
    pub fn new(initial_id: impl Into<String>, segment_size: Duration) -> Self {
        Self {
            current: WhisperSegment {
                id: initial_id.into(),
                index: 0,
                items: Vec::new(),
            },
            segment_size,
        }
    }

    pub fn current(&self) -> &WhisperSegment {
        &self.current
    }

    pub fn set_segment_size(&mut self, segment_size: Duration) {
        self.segment_size = segment_size;
    }

    pub fn replace_items(&mut self, items: Vec<WhisperText>) -> WhisperSegment {
        self.current.items = items;
        self.current.clone()
    }

    pub fn rollover_if_elapsed(
        &mut self,
        elapsed: Duration,
        next_id: impl Into<String>,
    ) -> Option<WhisperSegment> {
        if elapsed <= self.segment_size {
            return None;
        }

        self.current = WhisperSegment {
            id: next_id.into(),
            index: self.current.index + 1,
            items: Vec::new(),
        };

        Some(self.current.clone())
    }
}

#[derive(Debug, Clone)]
pub struct SegmentEmissionGate {
    last_emitted: Option<EmissionSnapshot>,
    pending: Option<PendingCandidate>,
}

#[derive(Debug, Clone)]
pub enum SegmentEmissionDecision {
    Emit(WhisperSegment),
    Suppress(SegmentSuppressionReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegmentSuppressionReason {
    Empty,
    DuplicateNormalizedText,
    PendingDrasticChange,
}

#[derive(Debug, Clone)]
struct EmissionSnapshot {
    normalized_text: String,
}

#[derive(Debug, Clone)]
struct PendingCandidate {
    segment_id: String,
    normalized_text: String,
}

impl Default for SegmentEmissionGate {
    fn default() -> Self {
        Self::new()
    }
}

impl SegmentEmissionGate {
    pub fn new() -> Self {
        Self {
            last_emitted: None,
            pending: None,
        }
    }

    pub fn evaluate(&mut self, candidate: WhisperSegment) -> SegmentEmissionDecision {
        let evaluate_started = Instant::now();
        let segment_id = candidate.id.clone();

        let normalize_started = Instant::now();
        let normalized_text = normalized_segment_text(&candidate);
        let normalize_duration = normalize_started.elapsed();

        let mut telemetry =
            GateEvaluationTelemetry::new(segment_id, normalize_duration, evaluate_started);
        let validation_started = Instant::now();
        let candidate_words = words(&normalized_text);
        telemetry.candidate_words = candidate_words.len();

        if normalized_text.is_empty() {
            telemetry.validation_duration += validation_started.elapsed();
            self.pending = None;
            return telemetry.suppress(SegmentSuppressionReason::Empty);
        }

        let Some(last_normalized_text) = self
            .last_emitted
            .as_ref()
            .map(|snapshot| snapshot.normalized_text.clone())
        else {
            telemetry.validation_duration += validation_started.elapsed();
            return self.emit(candidate, normalized_text, telemetry);
        };

        let last_words = words(&last_normalized_text);
        telemetry.last_emitted_words = last_words.len();

        if normalized_text == last_normalized_text {
            telemetry.validation_duration += validation_started.elapsed();
            self.pending = None;
            return telemetry.suppress(SegmentSuppressionReason::DuplicateNormalizedText);
        }

        if last_normalized_text.is_empty() || is_prefix_growth(&last_words, &candidate_words) {
            telemetry.validation_duration += validation_started.elapsed();
            return self.emit(candidate, normalized_text, telemetry);
        }
        telemetry.validation_duration += validation_started.elapsed();

        let drastic_change = check_drastic_change(&last_words, &candidate_words);
        telemetry.is_drastic = Some(drastic_change.is_drastic);
        telemetry.distance = drastic_change.distance;
        telemetry.drastic_check_duration = drastic_change.duration;
        telemetry.distance_duration = drastic_change.distance_duration;

        if drastic_change.is_drastic {
            if self.pending_matches(candidate.id.as_str(), normalized_text.as_str()) {
                return self.emit(candidate, normalized_text, telemetry);
            }

            self.pending = Some(PendingCandidate {
                segment_id: candidate.id,
                normalized_text,
            });
            return telemetry.suppress(SegmentSuppressionReason::PendingDrasticChange);
        }

        self.emit(candidate, normalized_text, telemetry)
    }

    pub fn reset_with_emitted(&mut self, segment: &WhisperSegment) {
        self.last_emitted = Some(EmissionSnapshot {
            normalized_text: normalized_segment_text(segment),
        });
        self.pending = None;
    }

    fn emit(
        &mut self,
        candidate: WhisperSegment,
        normalized_text: String,
        telemetry: GateEvaluationTelemetry,
    ) -> SegmentEmissionDecision {
        self.last_emitted = Some(EmissionSnapshot { normalized_text });
        self.pending = None;
        telemetry.emit(candidate)
    }

    fn pending_matches(&self, segment_id: &str, normalized_text: &str) -> bool {
        self.pending
            .as_ref()
            .map(|pending| {
                pending.segment_id == segment_id && pending.normalized_text == normalized_text
            })
            .unwrap_or(false)
    }
}

struct GateEvaluationTelemetry {
    segment_id: String,
    candidate_words: usize,
    last_emitted_words: usize,
    is_drastic: Option<bool>,
    distance: Option<usize>,
    normalize_duration: Duration,
    validation_duration: Duration,
    drastic_check_duration: Duration,
    distance_duration: Duration,
    evaluate_started: Instant,
}

struct DrasticChangeCheck {
    is_drastic: bool,
    distance: Option<usize>,
    duration: Duration,
    distance_duration: Duration,
}

impl GateEvaluationTelemetry {
    fn new(segment_id: String, normalize_duration: Duration, evaluate_started: Instant) -> Self {
        Self {
            segment_id,
            candidate_words: 0,
            last_emitted_words: 0,
            is_drastic: None,
            distance: None,
            normalize_duration,
            validation_duration: Duration::ZERO,
            drastic_check_duration: Duration::ZERO,
            distance_duration: Duration::ZERO,
            evaluate_started,
        }
    }

    fn emit(self, segment: WhisperSegment) -> SegmentEmissionDecision {
        self.log("emit", None);
        SegmentEmissionDecision::Emit(segment)
    }

    fn suppress(self, reason: SegmentSuppressionReason) -> SegmentEmissionDecision {
        self.log("suppress", Some(reason));
        SegmentEmissionDecision::Suppress(reason)
    }

    fn log(&self, decision: &str, suppression_reason: Option<SegmentSuppressionReason>) {
        debug!(
            segment_id = %self.segment_id,
            candidate_words = self.candidate_words,
            last_emitted_words = self.last_emitted_words,
            decision = decision,
            suppression_reason = ?suppression_reason,
            is_drastic = ?self.is_drastic,
            distance = ?self.distance,
            normalize_ms = elapsed_ms(self.normalize_duration),
            validation_ms = elapsed_ms(self.validation_duration),
            drastic_check_ms = elapsed_ms(self.drastic_check_duration),
            distance_ms = elapsed_ms(self.distance_duration),
            evaluate_ms = elapsed_ms(self.evaluate_started.elapsed()),
            "segment emission gate evaluated"
        );
    }
}

fn normalized_segment_text(segment: &WhisperSegment) -> String {
    let text = segment
        .items
        .iter()
        .map(|item| item.text.as_str())
        .collect::<Vec<_>>()
        .join("");

    normalize_transcript(&text)
}

fn is_prefix_growth(previous_words: &[&str], candidate_words: &[&str]) -> bool {
    candidate_words.len() > previous_words.len()
        && candidate_words
            .iter()
            .zip(previous_words.iter())
            .all(|(candidate, previous)| candidate == previous)
}

fn check_drastic_change(previous_words: &[&str], candidate_words: &[&str]) -> DrasticChangeCheck {
    let started = Instant::now();

    if previous_words.len() < DRASTIC_MIN_OLD_WORDS {
        return DrasticChangeCheck {
            is_drastic: false,
            distance: None,
            duration: started.elapsed(),
            distance_duration: Duration::ZERO,
        };
    }

    let shrink_threshold = previous_words.len() as f32 * DRASTIC_SHRINK_RATIO;
    let is_major_shrink = (candidate_words.len() as f32) <= shrink_threshold;

    let distance_started = Instant::now();
    let distance = levenshtein_distance(previous_words, candidate_words);
    let distance_duration = distance_started.elapsed();

    let ratio_denominator = previous_words.len().max(candidate_words.len()).max(1);
    let is_major_edit = distance >= DRASTIC_MIN_EDIT_WORDS
        && (distance as f32 / ratio_denominator as f32) >= DRASTIC_EDIT_RATIO;

    DrasticChangeCheck {
        is_drastic: is_major_shrink || is_major_edit,
        distance: Some(distance),
        duration: started.elapsed(),
        distance_duration,
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

fn elapsed_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(index: u64, text: &str) -> WhisperText {
        WhisperText {
            index,
            start_time: 0,
            end_time: 100,
            text: text.to_owned(),
        }
    }

    fn segment(id: &str, text_content: &str) -> WhisperSegment {
        WhisperSegment {
            id: id.to_owned(),
            index: 0,
            items: vec![text(0, text_content)],
        }
    }

    fn assert_emits(decision: SegmentEmissionDecision, expected_text: &str) {
        match decision {
            SegmentEmissionDecision::Emit(segment) => {
                assert_eq!(segment.items[0].text, expected_text);
            }
            SegmentEmissionDecision::Suppress(reason) => {
                panic!("expected emit, suppressed with {reason:?}");
            }
        }
    }

    fn assert_suppresses(
        decision: SegmentEmissionDecision,
        expected_reason: SegmentSuppressionReason,
    ) {
        match decision {
            SegmentEmissionDecision::Emit(segment) => {
                panic!("expected suppress, emitted {:?}", segment.items);
            }
            SegmentEmissionDecision::Suppress(reason) => assert_eq!(reason, expected_reason),
        }
    }

    #[test]
    fn replaces_items_without_changing_segment_identity() {
        let mut segments = SegmentAccumulator::new("segment-0", Duration::from_secs(15));

        let first = segments.replace_items(vec![text(0, "hello")]);
        let second = segments.replace_items(vec![text(0, "hello world")]);

        assert_eq!(first.id, "segment-0");
        assert_eq!(second.id, "segment-0");
        assert_eq!(second.index, 0);
        assert_eq!(second.items[0].text, "hello world");
    }

    #[test]
    fn rolls_over_after_configured_segment_size() {
        let mut segments = SegmentAccumulator::new("segment-0", Duration::from_secs(15));

        assert!(segments
            .rollover_if_elapsed(Duration::from_secs(15), "segment-1")
            .is_none());

        let next = segments
            .rollover_if_elapsed(Duration::from_millis(15_001), "segment-1")
            .expect("expected rollover");

        assert_eq!(next.id, "segment-1");
        assert_eq!(next.index, 1);
        assert!(next.items.is_empty());
        assert_eq!(segments.current().id, "segment-1");
    }

    #[test]
    fn supports_runtime_segment_size_updates() {
        let mut segments = SegmentAccumulator::new("segment-0", Duration::from_secs(15));

        segments.set_segment_size(Duration::from_secs(5));

        let next = segments
            .rollover_if_elapsed(Duration::from_secs(6), "segment-1")
            .expect("expected rollover");

        assert_eq!(next.index, 1);
    }

    #[test]
    fn emission_gate_emits_first_meaningful_update() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(gate.evaluate(segment("segment-0", "hello")), "hello");
    }

    #[test]
    fn emission_gate_suppresses_normalized_duplicates_and_punctuation_only_changes() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(
            gate.evaluate(segment("segment-0", "Hello world")),
            "Hello world",
        );

        assert_suppresses(
            gate.evaluate(segment("segment-0", "hello, world!")),
            SegmentSuppressionReason::DuplicateNormalizedText,
        );
    }

    #[test]
    fn emission_gate_suppresses_blank_updates() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(
            gate.evaluate(segment("segment-0", "hello world")),
            "hello world",
        );

        assert_suppresses(
            gate.evaluate(segment("segment-0", "")),
            SegmentSuppressionReason::Empty,
        );
    }

    #[test]
    fn emission_gate_emits_prefix_growth_immediately() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(
            gate.evaluate(segment("segment-0", "hello world")),
            "hello world",
        );
        assert_emits(
            gate.evaluate(segment("segment-0", "hello world again")),
            "hello world again",
        );
    }

    #[test]
    fn emission_gate_holds_drastic_rewrite_until_repeat() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(
            gate.evaluate(segment("segment-0", "alpha beta gamma delta")),
            "alpha beta gamma delta",
        );

        assert_suppresses(
            gate.evaluate(segment("segment-0", "one two three four")),
            SegmentSuppressionReason::PendingDrasticChange,
        );
        assert_emits(
            gate.evaluate(segment("segment-0", "one two three four")),
            "one two three four",
        );
    }

    #[test]
    fn emission_gate_holds_major_shrink_until_repeat() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(
            gate.evaluate(segment("segment-0", "alpha beta gamma delta epsilon")),
            "alpha beta gamma delta epsilon",
        );

        assert_suppresses(
            gate.evaluate(segment("segment-0", "alpha beta")),
            SegmentSuppressionReason::PendingDrasticChange,
        );
        assert_emits(
            gate.evaluate(segment("segment-0", "alpha beta")),
            "alpha beta",
        );
    }

    #[test]
    fn emission_gate_reset_allows_next_segment_text() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(
            gate.evaluate(segment("segment-0", "alpha beta gamma delta")),
            "alpha beta gamma delta",
        );

        let rollover = WhisperSegment {
            id: "segment-1".to_owned(),
            index: 1,
            items: Vec::new(),
        };
        gate.reset_with_emitted(&rollover);

        assert_emits(gate.evaluate(segment("segment-1", "alpha")), "alpha");
    }
}
