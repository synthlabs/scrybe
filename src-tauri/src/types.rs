#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct AppState {
    pub current_device: scrybe_core::devices::AudioDevice,
    pub audio_format: scrybe_core::devices::AudioFormat,
    pub model_path: String,
    pub audio_segment_size: u64,
    pub overlay_config: OverlayConfig,
    pub whisper_params: scrybe_core::whisper::WhisperParams,
    pub advanced_settings: AdvancedSettings,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_device: scrybe_core::devices::AudioDevice::default(),
            audio_format: scrybe_core::devices::AudioFormat::default(),
            model_path: Default::default(),
            audio_segment_size: 15,
            overlay_config: OverlayConfig::default(),
            whisper_params: scrybe_core::whisper::WhisperParams::default(),
            advanced_settings: AdvancedSettings::default(),
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct OverlayConfig {
    pub name: String,
    pub id: String,
    // #[ts(type = "\"left\" | \"center\" | \"right\"")]
    pub text_alignment: String,
    pub background_color: String,
    pub transparency: i32,
    pub font_size: i32,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            id: Default::default(),
            text_alignment: "center".to_string(), //TODO: make this an enum
            background_color: "#030712".to_string(),
            transparency: 75,
            font_size: 16,
        }
    }
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct AdvancedSettings {}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
pub struct ModelPreset {
    pub id: String,
    pub label: String,
    pub description: String,
    pub repo: String,
    pub filename: String,
}

pub const DEFAULT_MODEL_PRESET_ID: &str = "small-q8_0";

pub fn model_presets() -> Vec<ModelPreset> {
    let repo = "ggerganov/whisper.cpp".to_string();
    vec![
        ModelPreset {
            id: "tiny-q8_0".to_string(),
            label: "Tiny (Q8_0)".to_string(),
            description: "Fastest, lowest quality. ~44 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-tiny-q8_0.bin".to_string(),
        },
        ModelPreset {
            id: "base-q8_0".to_string(),
            label: "Base (Q8_0)".to_string(),
            description: "Very fast, basic quality. ~82 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-base-q8_0.bin".to_string(),
        },
        ModelPreset {
            id: DEFAULT_MODEL_PRESET_ID.to_string(),
            label: "Small (Q8_0) — default".to_string(),
            description: "Balanced speed and quality. ~264 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-small-q8_0.bin".to_string(),
        },
        ModelPreset {
            id: "medium-q8_0".to_string(),
            label: "Medium (Q8_0)".to_string(),
            description: "Higher quality, slower. ~823 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-medium-q8_0.bin".to_string(),
        },
        ModelPreset {
            id: "large-v3-turbo-q5_0".to_string(),
            label: "Large v3 Turbo (Q5_0)".to_string(),
            description: "Large-v3 quality, ~8× faster than non-turbo. ~574 MB."
                .to_string(),
            repo: repo.clone(),
            filename: "ggml-large-v3-turbo-q5_0.bin".to_string(),
        },
        ModelPreset {
            id: "large-v3-turbo-q8_0".to_string(),
            label: "Large v3 Turbo (Q8_0)".to_string(),
            description: "Highest quality turbo variant. ~874 MB.".to_string(),
            repo: repo.clone(),
            filename: "ggml-large-v3-turbo-q8_0.bin".to_string(),
        },
    ]
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WebsocketRequest {
    pub kind: String,
    pub data: String,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct WebsocketResponse {
    pub kind: String,
    pub data: String,
    pub is_error: bool,
}
