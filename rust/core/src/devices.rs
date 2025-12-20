pub struct DeviceManager {}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, specta::Type)]
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
