use tauri::{plugin::TauriPlugin, Manager, Runtime, State};
use tauri_specta::collect_commands;

#[derive(Clone, Debug, serde::Serialize, specta::Type)]
pub struct InternalBuildInfo {
    pub app_version: String,
    pub app_commit: String,
    pub build_time: String,
}

#[tauri::command]
#[specta::specta]
fn internal_build_info(build_info: State<'_, InternalBuildInfo>) -> InternalBuildInfo {
    build_info.inner().clone()
}

fn init<R: Runtime>(build_info: InternalBuildInfo) -> TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("internal")
        .invoke_handler(tauri::generate_handler![internal_build_info])
        .setup(move |app, _api| {
            app.manage(build_info);
            Ok(())
        })
        .build()
}

pub fn apply_plugins<R: Runtime>(
    builder: tauri::Builder<R>,
    build_info: InternalBuildInfo,
) -> tauri::Builder<R> {
    builder.plugin(init(build_info))
}

#[cfg(debug_assertions)]
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .plugin_name("internal")
        .commands(collect_commands![internal_build_info])
}

pub fn setup(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
