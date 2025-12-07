use std::time::SystemTime;

use crate::types::{WhisperParams, WhisperText};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct WhisperManager {
    ctx: WhisperContext,
    last_prompt: String,
    segment_index: u64,
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
        })
    }

    pub fn process_samples(
        &mut self,
        samples: Vec<f32>,
        params: WhisperParams,
    ) -> Result<Vec<WhisperText>, anyhow::Error> {
        let mut full_params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        println!("params: {:#?}", params);

        full_params.set_suppress_blank(params.toggles.suppress_blanks);
        full_params.set_print_special(params.toggles.print_special);
        full_params.set_print_progress(params.toggles.print_progress);
        full_params.set_token_timestamps(params.toggles.token_timestamps);
        full_params.set_single_segment(params.toggles.single_segment);
        full_params.set_split_on_word(params.toggles.split_on_word);
        full_params.set_tdrz_enable(params.toggles.tdrz_enable);
        full_params.set_translate(params.toggles.translate);
        full_params.set_language(Some(params.language.as_str()));

        // if !self.last_prompt.is_empty() {
        //     full_params.set_initial_prompt(&self.last_prompt.clone());
        // }

        let start = SystemTime::now();

        let mut state = self.ctx.create_state().expect("failed to create state");
        state.full(full_params, &samples[..])?;

        let end = SystemTime::now();

        println!(
            "Inference took {}ms",
            end.duration_since(start).unwrap().as_millis()
        );

        let mut segments: Vec<WhisperText> = Vec::new();
        for segment in state.as_iter() {
            let segment_text = segment.to_str()?;
            let start_time = segment.start_timestamp();
            let end_time = segment.end_timestamp();
            segments.push(WhisperText {
                index: self.segment_index,
                start_time,
                end_time,
                text: segment_text.to_string(),
            });

            println!("{}", segment_text);

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
                });
            }
        }

        Ok(segments)
    }
}
