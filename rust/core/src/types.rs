use ts_rs::TS;

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AppState {
    #[ts(type = "number")]
    pub generation: u64,
    pub current_device: AudioDevice,
    pub audio_format: AudioFormat,
    pub model_path: String,
    #[ts(type = "number")]
    pub audio_buffer_size: u64,
    pub overlay_config: OverlayConfig,
    pub whisper_params: WhisperParams,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AudioDevice {
    pub name: String,
    pub id: String,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AudioFormat {
    pub name: String,
    pub id: String,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct OverlayConfig {
    pub name: String,
    pub id: String,
    #[ts(type = "\"left\" | \"center\" | \"right\"")]
    pub text_alignment: String,
    pub background_color: String,
    pub transparency: i32,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct WhisperParams {
    pub toggles: WhisperToggles,
    pub language: String,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
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
