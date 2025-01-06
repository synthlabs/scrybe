use ts_rs::TS;

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AppState {
    pub running: bool,
    pub current_device: AudioDevice,
    #[ts(type = "number")]
    pub audio_buffer_size: u64,
    pub overlay_config: OverlayConfig,
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, TS)]
#[ts(export)]
pub struct AudioDevice {
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
}
