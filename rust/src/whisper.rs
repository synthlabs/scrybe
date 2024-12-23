use core::fmt;
use std::{sync::Mutex, time::SystemTime};

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(serde::Serialize, Clone)]
pub struct Batch {
    pub segments: Vec<WhisperSegment>,
}

#[derive(serde::Serialize, Clone)]
pub struct WhisperSegment {
    _index: i128,
    start_timestamp: i64,
    end_timestamp: i64,
    text: String,
}

impl fmt::Display for WhisperSegment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "[{}-{}] {}",
            self.start_timestamp, self.end_timestamp, self.text
        )
    }
}

#[derive(serde::Serialize, Clone, Default)]
pub struct Params {
    translate: bool,
    suppress_blanks: bool,
    print_special: bool,
    print_progress: bool,
    token_timestamps: bool,
    single_segment: bool,
    split_on_word: bool,
    tdrz_enable: bool,
    language: String,
}

pub struct WhisperManager {
    ctx: WhisperContext,
    last_prompt: String,
    segment_index: i128,
    params: Mutex<Params>,
}

impl WhisperManager {
    pub fn new(model_path: &str, use_gpu: bool) -> Result<Self, anyhow::Error> {
        let mut params = WhisperContextParameters::default();
        params.use_gpu = use_gpu;

        let ctx = WhisperContext::new_with_params(model_path, params)?;

        Ok(WhisperManager {
            ctx,
            last_prompt: "".to_owned(),
            segment_index: 0,
            params: Params::default().into(),
        })
    }

    pub fn set_params(&mut self, new_params: Params) {
        let mut params = self.params.lock().unwrap();
        *params = new_params;
    }

    pub fn process_samples(
        &mut self,
        samples: Vec<f32>,
    ) -> Result<Vec<WhisperSegment>, anyhow::Error> {
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        let language;
        {
            let prefs = self.params.lock().unwrap();
            language = prefs.language.clone();
            params.set_suppress_blank(prefs.suppress_blanks);
            params.set_print_special(prefs.print_special);
            params.set_print_progress(prefs.print_progress);
            params.set_token_timestamps(prefs.token_timestamps);
            params.set_single_segment(prefs.single_segment);
            params.set_split_on_word(prefs.split_on_word);
            params.set_tdrz_enable(prefs.tdrz_enable);
            params.set_translate(prefs.translate);
            params.set_language(Some(language.as_str()));
        }
        // if !self.last_prompt.is_empty() {
        //     params.set_initial_prompt(&self.last_prompt.clone());
        // }

        let start = SystemTime::now();

        let mut state = self.ctx.create_state().expect("failed to create state");
        state.full(params, &samples[..])?;

        let end = SystemTime::now();

        println!(
            "Inference took {}ms",
            end.duration_since(start).unwrap().as_millis()
        );

        let mut segments: Vec<WhisperSegment> = Vec::new();
        let num_segments = state.full_n_segments()?;
        for i in 0..num_segments {
            let segment = state.full_get_segment_text(i)?;
            let start_timestamp = state.full_get_segment_t0(i)?;
            let end_timestamp = state.full_get_segment_t1(i)?;
            segments.push(WhisperSegment {
                _index: self.segment_index,
                start_timestamp,
                end_timestamp,
                text: segment.clone(),
            });

            let new_prompt = segment.clone();
            if new_prompt != self.last_prompt {
                self.last_prompt = new_prompt;
            } else {
                self.last_prompt = "".to_owned();
            }
            self.segment_index += 1;
            // TODO: format those as json

            if state.full_get_segment_speaker_turn_next(i) {
                segments.push(WhisperSegment {
                    _index: 0,
                    start_timestamp: 0,
                    end_timestamp: 0,
                    text: "<Speaker change>".to_owned(),
                });
            }
        }

        Ok(segments)
    }
}
