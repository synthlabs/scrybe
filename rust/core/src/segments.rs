use std::time::Duration;

use crate::whisper::{WhisperSegment, WhisperText};

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
}
