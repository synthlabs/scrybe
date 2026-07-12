use std::time::{Duration, Instant};

use tracing::debug;

use crate::{
    validation::normalize_transcript,
    whisper::{WhisperProcessEvidence, WhisperSegment, WhisperText},
};

// TODO: Make segment emission gate thresholds configurable after tuning with real transcription sessions.
const DRASTIC_MIN_OLD_WORDS: usize = 4;
const DRASTIC_SHRINK_RATIO: f32 = 0.60;
const DRASTIC_EDIT_RATIO: f32 = 0.50;
const DRASTIC_MIN_EDIT_WORDS: usize = 3;
const GATE_TELEMETRY_MAX_ENTRIES: usize = 50;

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
    last_ambiguous_phrase: Option<AmbiguousPhraseOccurrence>,
    next_sequence: u64,
}

#[derive(Debug, Clone)]
pub enum SegmentEmissionDecision {
    Emit(WhisperSegment),
    Suppress(SegmentSuppressionReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum SegmentSuppressionReason {
    Empty,
    NoVoiceActivity,
    KnownHallucination,
    AmbiguousHallucination,
    DuplicateNormalizedText,
    PendingDrasticChange,
}

#[derive(Debug, Clone)]
pub struct SegmentEmissionGateEvaluation {
    pub decision: SegmentEmissionDecision,
    pub telemetry: GateEvaluationTelemetryEntry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum SegmentEmissionDecisionKind {
    Emit,
    Suppress,
}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(default)]
pub struct GateTelemetryState {
    pub entries: Vec<GateEvaluationTelemetryEntry>,
}

impl GateTelemetryState {
    pub fn push(&mut self, entry: GateEvaluationTelemetryEntry) {
        self.entries.push(entry);

        let overflow = self
            .entries
            .len()
            .saturating_sub(GATE_TELEMETRY_MAX_ENTRIES);
        if overflow > 0 {
            self.entries.drain(0..overflow);
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct GateEvaluationTelemetryEntry {
    pub sequence: u64,
    pub segment_id: String,
    pub candidate_words: u64,
    pub last_emitted_words: u64,
    pub decision: SegmentEmissionDecisionKind,
    pub suppression_reason: Option<SegmentSuppressionReason>,
    pub is_drastic: Option<bool>,
    pub distance: Option<u64>,
    pub matched_phrase: Option<String>,
    pub vad_speech_detected: Option<bool>,
    pub vad_mean_probability: Option<f32>,
    pub no_speech_probability: Option<f32>,
    pub normalize_ms: f64,
    pub validation_ms: f64,
    pub drastic_check_ms: f64,
    pub distance_ms: f64,
    pub evaluate_ms: f64,
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

#[derive(Debug, Clone)]
struct AmbiguousPhraseOccurrence {
    segment_id: String,
    phrase: String,
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
            last_ambiguous_phrase: None,
            next_sequence: 1,
        }
    }

    pub fn evaluate(&mut self, candidate: WhisperSegment) -> SegmentEmissionGateEvaluation {
        self.evaluate_with_evidence(candidate, &WhisperProcessEvidence::default())
    }

    pub fn evaluate_with_evidence(
        &mut self,
        candidate: WhisperSegment,
        evidence: &WhisperProcessEvidence,
    ) -> SegmentEmissionGateEvaluation {
        let evaluate_started = Instant::now();
        let segment_id = candidate.id.clone();
        let sequence = self.next_sequence;
        self.next_sequence += 1;

        let normalize_started = Instant::now();
        let normalized_text = normalized_segment_text(&candidate);
        let normalize_duration = normalize_started.elapsed();

        let mut telemetry = GateEvaluationTelemetry::new(
            sequence,
            segment_id,
            normalize_duration,
            evaluate_started,
        );
        telemetry.vad_speech_detected = evidence.vad_speech_detected;
        telemetry.vad_mean_probability = evidence.vad_mean_probability;
        telemetry.no_speech_probability = evidence.no_speech_probability;
        let validation_started = Instant::now();
        let candidate_words = words(&normalized_text);
        telemetry.candidate_words = candidate_words.len();

        if evidence.vad_speech_detected == Some(false) {
            telemetry.validation_duration += validation_started.elapsed();
            self.pending = None;
            return telemetry.suppress(SegmentSuppressionReason::NoVoiceActivity);
        }

        if normalized_text.is_empty() {
            telemetry.validation_duration += validation_started.elapsed();
            self.pending = None;
            return telemetry.suppress(SegmentSuppressionReason::Empty);
        }

        if is_known_hallucination(&normalized_text) {
            telemetry.matched_phrase = Some(normalized_text);
            telemetry.validation_duration += validation_started.elapsed();
            self.pending = None;
            return telemetry.suppress(SegmentSuppressionReason::KnownHallucination);
        }

        let ambiguous_phrase = ambiguous_hallucination_phrase(&normalized_text);
        if let Some(phrase) = ambiguous_phrase.as_deref() {
            telemetry.matched_phrase = Some(phrase.to_owned());
            let weak_vad = evidence
                .vad_mean_probability
                .zip(evidence.vad_threshold)
                .map(|(probability, threshold)| probability < threshold + 0.10)
                .unwrap_or(false);
            let no_speech = evidence
                .no_speech_probability
                .map(|probability| probability >= 0.60)
                .unwrap_or(false);
            let repeated_segment = self
                .last_ambiguous_phrase
                .as_ref()
                .map(|last| last.segment_id != candidate.id && last.phrase == phrase)
                .unwrap_or(false);

            if weak_vad
                || no_speech
                || repeated_segment
                || is_repeated_ambiguous_phrase(&normalized_text)
            {
                self.last_ambiguous_phrase = Some(AmbiguousPhraseOccurrence {
                    segment_id: candidate.id.clone(),
                    phrase: phrase.to_owned(),
                });
                telemetry.validation_duration += validation_started.elapsed();
                self.pending = None;
                return telemetry.suppress(SegmentSuppressionReason::AmbiguousHallucination);
            }
        }

        let Some(last_normalized_text) = self
            .last_emitted
            .as_ref()
            .map(|snapshot| snapshot.normalized_text.clone())
        else {
            telemetry.validation_duration += validation_started.elapsed();
            return self.emit(candidate, normalized_text, ambiguous_phrase, telemetry);
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
            return self.emit(candidate, normalized_text, ambiguous_phrase, telemetry);
        }
        telemetry.validation_duration += validation_started.elapsed();

        let drastic_change = check_drastic_change(&last_words, &candidate_words);
        telemetry.is_drastic = Some(drastic_change.is_drastic);
        telemetry.distance = drastic_change.distance;
        telemetry.drastic_check_duration = drastic_change.duration;
        telemetry.distance_duration = drastic_change.distance_duration;

        if drastic_change.is_drastic {
            if self.pending_confirms(
                candidate.id.as_str(),
                normalized_text.as_str(),
                &candidate_words,
            ) {
                return self.emit(candidate, normalized_text, ambiguous_phrase, telemetry);
            }

            self.pending = Some(PendingCandidate {
                segment_id: candidate.id,
                normalized_text,
            });
            return telemetry.suppress(SegmentSuppressionReason::PendingDrasticChange);
        }

        self.emit(candidate, normalized_text, ambiguous_phrase, telemetry)
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
        ambiguous_phrase: Option<String>,
        telemetry: GateEvaluationTelemetry,
    ) -> SegmentEmissionGateEvaluation {
        self.last_ambiguous_phrase = ambiguous_phrase.map(|phrase| AmbiguousPhraseOccurrence {
            segment_id: candidate.id.clone(),
            phrase,
        });
        self.last_emitted = Some(EmissionSnapshot { normalized_text });
        self.pending = None;
        telemetry.emit(candidate)
    }

    fn pending_confirms(
        &self,
        segment_id: &str,
        normalized_text: &str,
        candidate_words: &[&str],
    ) -> bool {
        self.pending
            .as_ref()
            .map(|pending| {
                if pending.segment_id != segment_id {
                    return false;
                }

                if pending.normalized_text == normalized_text {
                    return true;
                }

                let pending_words = words(&pending.normalized_text);
                is_prefix_growth(&pending_words, candidate_words)
            })
            .unwrap_or(false)
    }
}

struct GateEvaluationTelemetry {
    sequence: u64,
    segment_id: String,
    candidate_words: usize,
    last_emitted_words: usize,
    is_drastic: Option<bool>,
    distance: Option<usize>,
    matched_phrase: Option<String>,
    vad_speech_detected: Option<bool>,
    vad_mean_probability: Option<f32>,
    no_speech_probability: Option<f32>,
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
    fn new(
        sequence: u64,
        segment_id: String,
        normalize_duration: Duration,
        evaluate_started: Instant,
    ) -> Self {
        Self {
            sequence,
            segment_id,
            candidate_words: 0,
            last_emitted_words: 0,
            is_drastic: None,
            distance: None,
            matched_phrase: None,
            vad_speech_detected: None,
            vad_mean_probability: None,
            no_speech_probability: None,
            normalize_duration,
            validation_duration: Duration::ZERO,
            drastic_check_duration: Duration::ZERO,
            distance_duration: Duration::ZERO,
            evaluate_started,
        }
    }

    fn emit(self, segment: WhisperSegment) -> SegmentEmissionGateEvaluation {
        let telemetry = self.into_entry(SegmentEmissionDecisionKind::Emit, None);
        log_gate_telemetry(&telemetry);

        SegmentEmissionGateEvaluation {
            decision: SegmentEmissionDecision::Emit(segment),
            telemetry,
        }
    }

    fn suppress(self, reason: SegmentSuppressionReason) -> SegmentEmissionGateEvaluation {
        let telemetry = self.into_entry(SegmentEmissionDecisionKind::Suppress, Some(reason));
        log_gate_telemetry(&telemetry);

        SegmentEmissionGateEvaluation {
            decision: SegmentEmissionDecision::Suppress(reason),
            telemetry,
        }
    }

    fn into_entry(
        self,
        decision: SegmentEmissionDecisionKind,
        suppression_reason: Option<SegmentSuppressionReason>,
    ) -> GateEvaluationTelemetryEntry {
        GateEvaluationTelemetryEntry {
            sequence: self.sequence,
            segment_id: self.segment_id,
            candidate_words: self.candidate_words as u64,
            last_emitted_words: self.last_emitted_words as u64,
            decision,
            suppression_reason,
            is_drastic: self.is_drastic,
            distance: self.distance.map(|distance| distance as u64),
            matched_phrase: self.matched_phrase,
            vad_speech_detected: self.vad_speech_detected,
            vad_mean_probability: self.vad_mean_probability,
            no_speech_probability: self.no_speech_probability,
            normalize_ms: elapsed_ms(self.normalize_duration),
            validation_ms: elapsed_ms(self.validation_duration),
            drastic_check_ms: elapsed_ms(self.drastic_check_duration),
            distance_ms: elapsed_ms(self.distance_duration),
            evaluate_ms: elapsed_ms(self.evaluate_started.elapsed()),
        }
    }
}

fn log_gate_telemetry(entry: &GateEvaluationTelemetryEntry) {
    debug!(
        segment_id = %entry.segment_id,
        candidate_words = entry.candidate_words,
        last_emitted_words = entry.last_emitted_words,
        decision = ?entry.decision,
        suppression_reason = ?entry.suppression_reason,
        is_drastic = ?entry.is_drastic,
        distance = ?entry.distance,
        matched_phrase = ?entry.matched_phrase,
        vad_speech_detected = ?entry.vad_speech_detected,
        vad_mean_probability = ?entry.vad_mean_probability,
        no_speech_probability = ?entry.no_speech_probability,
        normalize_ms = entry.normalize_ms,
        validation_ms = entry.validation_ms,
        drastic_check_ms = entry.drastic_check_ms,
        distance_ms = entry.distance_ms,
        evaluate_ms = entry.evaluate_ms,
        "segment emission gate evaluated"
    );
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

fn is_known_hallucination(normalized_text: &str) -> bool {
    const PHRASES: &[&str] = &[
        "subtitles by dima",
        "subtitles by dimatorzok",
        "субтитры сделал dimatorzok",
        "субтитры создавал dimatorzok",
        "продолжение следует",
        "transcription by castingwords",
        "subtitles by the amara org community",
        "由 amara org 社群提供的字幕",
    ];

    PHRASES.contains(&normalized_text)
}

fn ambiguous_hallucination_phrase(normalized_text: &str) -> Option<String> {
    const PHRASES: &[&str] = &[
        "thank you for watching until the end",
        "thank you for watching my video",
        "thank you for watching",
        "thanks for watching",
        "thank you",
        "thanks",
    ];

    PHRASES
        .iter()
        .find(|phrase| normalized_text == **phrase)
        .map(|phrase| (*phrase).to_owned())
        .or_else(|| {
            PHRASES.iter().find_map(|phrase| {
                let phrase_words = words(phrase);
                let candidate_words = words(normalized_text);
                (candidate_words.len() >= phrase_words.len() * 3
                    && candidate_words.len() % phrase_words.len() == 0
                    && candidate_words
                        .chunks_exact(phrase_words.len())
                        .all(|chunk| chunk == phrase_words))
                .then(|| (*phrase).to_owned())
            })
        })
}

fn is_repeated_ambiguous_phrase(normalized_text: &str) -> bool {
    ambiguous_hallucination_phrase(normalized_text)
        .map(|phrase| words(normalized_text).len() >= words(&phrase).len() * 3)
        .unwrap_or(false)
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

    fn assert_emits(evaluation: SegmentEmissionGateEvaluation, expected_text: &str) {
        assert_eq!(
            evaluation.telemetry.decision,
            SegmentEmissionDecisionKind::Emit
        );
        assert!(evaluation.telemetry.suppression_reason.is_none());

        match evaluation.decision {
            SegmentEmissionDecision::Emit(segment) => {
                assert_eq!(segment.items[0].text, expected_text);
            }
            SegmentEmissionDecision::Suppress(reason) => {
                panic!("expected emit, suppressed with {reason:?}");
            }
        }
    }

    fn assert_suppresses(
        evaluation: SegmentEmissionGateEvaluation,
        expected_reason: SegmentSuppressionReason,
    ) {
        assert_eq!(
            evaluation.telemetry.decision,
            SegmentEmissionDecisionKind::Suppress
        );
        assert_eq!(
            evaluation.telemetry.suppression_reason,
            Some(expected_reason)
        );

        match evaluation.decision {
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

        let evaluation = gate.evaluate(segment("segment-0", "hello"));

        assert_eq!(evaluation.telemetry.sequence, 1);
        assert_eq!(evaluation.telemetry.segment_id, "segment-0");
        assert_eq!(evaluation.telemetry.candidate_words, 1);
        assert_eq!(evaluation.telemetry.last_emitted_words, 0);
        assert!(evaluation.telemetry.evaluate_ms >= evaluation.telemetry.normalize_ms);
        assert_emits(evaluation, "hello");
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
    fn emission_gate_emits_drastic_rewrite_when_next_update_extends_pending_text() {
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
            gate.evaluate(segment("segment-0", "one two three four five")),
            "one two three four five",
        );
    }

    #[test]
    fn emission_gate_keeps_holding_divergent_drastic_rewrites() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(
            gate.evaluate(segment("segment-0", "alpha beta gamma delta")),
            "alpha beta gamma delta",
        );

        assert_suppresses(
            gate.evaluate(segment("segment-0", "one two three four")),
            SegmentSuppressionReason::PendingDrasticChange,
        );
        assert_suppresses(
            gate.evaluate(segment("segment-0", "nine ten eleven twelve")),
            SegmentSuppressionReason::PendingDrasticChange,
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

    #[test]
    fn emission_gate_telemetry_records_suppression_details() {
        let mut gate = SegmentEmissionGate::new();

        assert_emits(
            gate.evaluate(segment("segment-0", "alpha beta gamma delta")),
            "alpha beta gamma delta",
        );
        let evaluation = gate.evaluate(segment("segment-0", "one two three four"));

        assert_eq!(evaluation.telemetry.sequence, 2);
        assert_eq!(
            evaluation.telemetry.decision,
            SegmentEmissionDecisionKind::Suppress
        );
        assert_eq!(
            evaluation.telemetry.suppression_reason,
            Some(SegmentSuppressionReason::PendingDrasticChange)
        );
        assert_eq!(evaluation.telemetry.candidate_words, 4);
        assert_eq!(evaluation.telemetry.last_emitted_words, 4);
        assert_eq!(evaluation.telemetry.is_drastic, Some(true));
        assert_eq!(evaluation.telemetry.distance, Some(4));
        assert_suppresses(evaluation, SegmentSuppressionReason::PendingDrasticChange);
    }

    #[test]
    fn emission_gate_always_suppresses_exact_credit_hallucinations() {
        let mut gate = SegmentEmissionGate::new();

        assert_suppresses(
            gate.evaluate(segment("segment-0", "Субтитры сделал DimaTorzok")),
            SegmentSuppressionReason::KnownHallucination,
        );
    }

    #[test]
    fn emission_gate_keeps_ambiguous_phrase_with_strong_speech_evidence() {
        let mut gate = SegmentEmissionGate::new();
        let evidence = WhisperProcessEvidence {
            vad_threshold: Some(0.5),
            vad_mean_probability: Some(0.9),
            no_speech_probability: Some(0.1),
            ..WhisperProcessEvidence::default()
        };

        assert_emits(
            gate.evaluate_with_evidence(segment("segment-0", "Thank you"), &evidence),
            "Thank you",
        );
    }

    #[test]
    fn emission_gate_suppresses_ambiguous_phrase_with_weak_vad_evidence() {
        let mut gate = SegmentEmissionGate::new();
        let evidence = WhisperProcessEvidence {
            vad_threshold: Some(0.5),
            vad_mean_probability: Some(0.55),
            ..WhisperProcessEvidence::default()
        };

        assert_suppresses(
            gate.evaluate_with_evidence(segment("segment-0", "Thank you"), &evidence),
            SegmentSuppressionReason::AmbiguousHallucination,
        );
    }

    #[test]
    fn emission_gate_suppresses_repeated_ambiguous_phrase_within_candidate() {
        let mut gate = SegmentEmissionGate::new();

        assert_suppresses(
            gate.evaluate(segment("segment-0", "Thank you. Thank you. Thank you.")),
            SegmentSuppressionReason::AmbiguousHallucination,
        );
    }

    #[test]
    fn emission_gate_does_not_treat_same_segment_revision_as_cross_segment_repetition() {
        let mut gate = SegmentEmissionGate::new();
        let evidence = WhisperProcessEvidence {
            vad_threshold: Some(0.5),
            vad_mean_probability: Some(0.9),
            ..WhisperProcessEvidence::default()
        };

        assert_emits(
            gate.evaluate_with_evidence(segment("segment-0", "Thank you"), &evidence),
            "Thank you",
        );
        assert_suppresses(
            gate.evaluate_with_evidence(segment("segment-0", "Thank you!"), &evidence),
            SegmentSuppressionReason::DuplicateNormalizedText,
        );
    }

    #[test]
    fn emission_gate_suppresses_ambiguous_phrase_repeated_in_next_segment() {
        let mut gate = SegmentEmissionGate::new();
        let evidence = WhisperProcessEvidence {
            vad_threshold: Some(0.5),
            vad_mean_probability: Some(0.9),
            ..WhisperProcessEvidence::default()
        };

        assert_emits(
            gate.evaluate_with_evidence(segment("segment-0", "Thank you"), &evidence),
            "Thank you",
        );
        gate.reset_with_emitted(&WhisperSegment {
            id: "segment-1".to_owned(),
            index: 1,
            items: Vec::new(),
        });
        assert_suppresses(
            gate.evaluate_with_evidence(segment("segment-1", "Thank you"), &evidence),
            SegmentSuppressionReason::AmbiguousHallucination,
        );
    }

    #[test]
    fn emission_gate_reports_no_voice_activity_before_empty_text() {
        let mut gate = SegmentEmissionGate::new();
        let evidence = WhisperProcessEvidence {
            vad_speech_detected: Some(false),
            ..WhisperProcessEvidence::default()
        };

        assert_suppresses(
            gate.evaluate_with_evidence(segment("segment-0", ""), &evidence),
            SegmentSuppressionReason::NoVoiceActivity,
        );
    }

    #[test]
    fn gate_telemetry_state_keeps_latest_entries() {
        let mut state = GateTelemetryState::default();

        for sequence in 1..=55 {
            state.push(GateEvaluationTelemetryEntry {
                sequence,
                segment_id: "segment-0".to_owned(),
                candidate_words: 1,
                last_emitted_words: 0,
                decision: SegmentEmissionDecisionKind::Emit,
                suppression_reason: None,
                is_drastic: None,
                distance: None,
                matched_phrase: None,
                vad_speech_detected: None,
                vad_mean_probability: None,
                no_speech_probability: None,
                normalize_ms: 0.0,
                validation_ms: 0.0,
                drastic_check_ms: 0.0,
                distance_ms: 0.0,
                evaluate_ms: 0.0,
            });
        }

        assert_eq!(state.entries.len(), GATE_TELEMETRY_MAX_ENTRIES);
        assert_eq!(state.entries[0].sequence, 6);
        assert_eq!(state.entries.last().unwrap().sequence, 55);
    }
}
