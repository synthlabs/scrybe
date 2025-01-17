use ts_rs::TS;

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AppState {
    pub current_device: AudioDevice,
    pub audio_format: AudioFormat,
    pub model_path: String,
    #[ts(type = "number")]
    pub audio_segment_size: u64,
    pub overlay_config: OverlayConfig,
    pub whisper_params: WhisperParams,
    pub advanced_settings: AdvancedSettings,
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
    #[ts(type = "number")]
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

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AdvancedSettings {}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct WhisperText {
    #[ts(type = "number")]
    pub index: u64,
    #[ts(type = "number")]
    pub start_time: i64,
    pub end_time: i64,
    pub text: String,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct WhisperSegment {
    pub id: String,
    #[ts(type = "number")]
    pub index: u64,
    pub items: Vec<WhisperText>,
}
