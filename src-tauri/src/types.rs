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
