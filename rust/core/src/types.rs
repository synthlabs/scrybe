use ts_rs::TS;

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, TS)]
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

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_device: AudioDevice::default(),
            audio_format: AudioFormat::default(),
            model_path: Default::default(),
            audio_segment_size: 15,
            overlay_config: OverlayConfig::default(),
            whisper_params: WhisperParams::default(),
            advanced_settings: AdvancedSettings::default(),
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AudioDevice {
    pub name: String,
    pub id: String,
}

impl Default for AudioDevice {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            id: Default::default(),
        }
    }
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AudioFormat {
    pub name: String,
    pub id: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, TS)]
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

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            id: Default::default(),
            text_alignment: "center".to_string(), //TODO: make this an enum
            background_color: "#030712".to_string(),
            transparency: 75,
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
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

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, TS)]
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
