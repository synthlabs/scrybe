#[cfg(internal_enabled)]
mod local {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../internal/rust/mod.rs"
    ));
}

#[cfg(not(internal_enabled))]
mod local {
    #[allow(dead_code)]
    pub struct InternalBuildInfo {
        pub app_version: String,
        pub app_commit: String,
        pub build_time: String,
    }

    pub fn apply_plugins<R: tauri::Runtime>(
        builder: tauri::Builder<R>,
        _build_info: InternalBuildInfo,
    ) -> tauri::Builder<R> {
        builder
    }

    pub fn setup(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
        Ok(())
    }
}

pub use local::{apply_plugins, setup, InternalBuildInfo};

#[cfg(all(debug_assertions, internal_enabled))]
pub use local::specta_builder;
