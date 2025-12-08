use std::time::SystemTime;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WhisperText {
    pub index: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub text: String,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WhisperSegment {
    pub id: String,
    pub index: u64,
    pub items: Vec<WhisperText>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WhisperParams {
    pub toggles: WhisperToggles,
    pub language: String,
}

impl Default for WhisperParams {
    fn default() -> Self {
        Self {
            toggles: WhisperToggles::default(),
            language: "auto".to_string(), // TODO: turn this into an enum
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WhisperToggles {
    pub translate: bool,
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
            translate: false,
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
