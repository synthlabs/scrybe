pub struct DeviceManager {}

pub const DEFAULT_OUTPUT_ID: &str = "default:output";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum AudioSourceKind {
    Input,
    Output,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct AudioDeviceOption {
    pub id: String,
    pub name: String,
    pub kind: Option<AudioSourceKind>,
    pub is_default: bool,
}

impl From<AudioDeviceOption> for AudioDevice {
    fn from(option: AudioDeviceOption) -> Self {
        Self {
            id: option.id,
            name: option.name,
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, specta::Type)]
#[serde(default)]
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

#[derive(Debug, Default, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
#[serde(default)]
pub struct AudioFormat {
    pub name: String,
    pub id: String,
}

impl DeviceManager {
    pub fn new() -> DeviceManager {
        DeviceManager {}
    }
}
