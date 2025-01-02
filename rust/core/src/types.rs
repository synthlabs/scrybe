use ts_rs::TS;

#[derive(Debug, Default, serde::Serialize, Clone, TS)]
#[ts(export)]
pub struct AppState {
    pub running: bool,
    pub current_device: AudioDevice,
    pub audio_buffer_size: u64,
}

#[derive(Debug, Default, serde::Serialize, Clone, TS)]
#[ts(export)]
pub struct AudioDevice {
    pub name: String,
    pub id: String,
}
