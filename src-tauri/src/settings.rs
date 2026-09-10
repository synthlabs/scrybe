use std::{path::Path, sync::Mutex};

use scrybe_core::{devices::AudioDevice, whisper::WhisperParams};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

use crate::{
    create_whisper_manager, download_preset_file, download_vad_model, get_audio_devices,
    has_nvidia_gpu,
    types::{AdvancedSettings, AppState},
    InternalState, RuntimeDependencyState, SharedWhisperManager, StateSyncer, StateSyncerConfig,
    VadRuntimeState, WebsocketManager, WhisperManager,
};

#[derive(Default)]
pub struct SettingsRuntime {
    pub operation: Mutex<()>,
    pub commit: Mutex<()>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct SettingsValues {
    pub current_device: AudioDevice,
    pub audio_segment_size: u64,
    pub whisper_params: WhisperParams,
    pub advanced_settings: AdvancedSettings,
}

impl From<&AppState> for SettingsValues {
    fn from(state: &AppState) -> Self {
        Self {
            current_device: state.current_device.clone(),
            audio_segment_size: state.audio_segment_size,
            whisper_params: state.whisper_params.clone(),
            advanced_settings: state.advanced_settings.clone(),
        }
    }
}

impl SettingsValues {
    pub fn write_to(&self, state: &mut AppState) {
        state.current_device = self.current_device.clone();
        state.audio_segment_size = self.audio_segment_size;
        state.whisper_params = self.whisper_params.clone();
        state.advanced_settings = self.advanced_settings.clone();
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct SettingsSnapshot {
    pub values: SettingsValues,
    pub model_path: String,
}

impl From<&AppState> for SettingsSnapshot {
    fn from(state: &AppState) -> Self {
        Self {
            values: SettingsValues::from(state),
            model_path: state.model_path.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ModelSelection {
    Preset { id: String },
    File { path: String },
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct SettingsRequest {
    pub values: SettingsValues,
    pub model: Option<ModelSelection>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SettingsErrorKind {
    Busy,
    Running,
    InvalidDevice,
    InvalidValue,
    Download,
    ModelLoad,
    Save,
    Internal,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct SettingsError {
    pub kind: SettingsErrorKind,
    pub details: String,
}

impl SettingsError {
    fn new(kind: SettingsErrorKind, details: impl ToString) -> Self {
        Self {
            kind,
            details: details.to_string(),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SettingsApplyPhase {
    Downloading,
    Loading,
    Applying,
}

struct PreparedChange<M> {
    snapshot: SettingsSnapshot,
    model: Option<M>,
}

fn prepare_change<M>(
    request: SettingsRequest,
    current: &SettingsSnapshot,
    running: bool,
    resolve: impl FnOnce(ModelSelection) -> Result<String, SettingsError>,
    load: impl FnOnce(&str) -> Result<M, SettingsError>,
) -> Result<PreparedChange<M>, SettingsError> {
    if !(5..=60).contains(&request.values.audio_segment_size) {
        return Err(SettingsError::new(
            SettingsErrorKind::InvalidValue,
            "Segment length must be between 5 and 60 seconds.",
        ));
    }
    if running
        && (request.model.is_some()
            || request.values.current_device.id != current.values.current_device.id)
    {
        return Err(SettingsError::new(
            SettingsErrorKind::Running,
            "Stop captions before changing the audio source or model.",
        ));
    }
    let path = match request.model {
        Some(selection) => resolve(selection)?,
        None => current.model_path.clone(),
    };
    let model = if path != current.model_path {
        Some(load(&path)?)
    } else {
        None
    };
    Ok(PreparedChange {
        snapshot: SettingsSnapshot {
            values: request.values,
            model_path: path,
        },
        model,
    })
}

fn progress(app: &AppHandle, phase: SettingsApplyPhase) {
    let _ = app.emit("settings_apply_progress", phase);
}

struct PreparedModel {
    manager: WhisperManager,
    runtime: RuntimeDependencyState,
    vad: VadRuntimeState,
}

fn prepare_model(app: &AppHandle, path: &str) -> Result<PreparedModel, SettingsError> {
    progress(app, SettingsApplyPhase::Loading);
    let has_nvidia = has_nvidia_gpu();
    let vad_model = download_vad_model().map_err(|error| error.to_string());
    match create_whisper_manager(path, true, &vad_model) {
        Ok((manager, vad)) => Ok(PreparedModel {
            manager,
            vad,
            runtime: RuntimeDependencyState::ready_gpu(has_nvidia),
        }),
        Err(gpu_error) => match create_whisper_manager(path, false, &vad_model) {
            Ok((manager, vad)) => Ok(PreparedModel {
                manager,
                vad,
                runtime: RuntimeDependencyState::ready_cpu_fallback(
                    has_nvidia,
                    format!("GPU initialization failed: {gpu_error}"),
                ),
            }),
            Err(cpu_error) => Err(SettingsError::new(
                SettingsErrorKind::ModelLoad,
                format!("GPU: {gpu_error}; CPU: {cpu_error}"),
            )),
        },
    }
}

fn apply(app: &AppHandle, mut request: SettingsRequest) -> Result<SettingsSnapshot, SettingsError> {
    let runtime = app.state::<SettingsRuntime>();
    let _operation = runtime.operation.try_lock().map_err(|_| {
        SettingsError::new(
            SettingsErrorKind::Busy,
            "Another settings operation is in progress.",
        )
    })?;
    let syncer = app.state::<StateSyncer>();
    let current = SettingsSnapshot::from(&syncer.snapshot::<AppState>("app_state"));
    let running = syncer
        .snapshot::<InternalState>("internal_state")
        .transcribe_running;
    if request.values.current_device.id != current.values.current_device.id
        && !request.values.current_device.id.is_empty()
    {
        let devices = get_audio_devices(app.state::<StateSyncer>())
            .map_err(|error| SettingsError::new(SettingsErrorKind::InvalidDevice, error))?;
        request.values.current_device = devices
            .into_iter()
            .find(|device| device.id == request.values.current_device.id)
            .ok_or_else(|| {
                SettingsError::new(
                    SettingsErrorKind::InvalidDevice,
                    "The selected audio source is no longer available.",
                )
            })?;
    }
    let prepared = prepare_change(
        request,
        &current,
        running,
        |selection| match selection {
            ModelSelection::Preset { id } => {
                let preset = crate::types::model_presets()
                    .into_iter()
                    .find(|preset| preset.id == id)
                    .ok_or_else(|| {
                        SettingsError::new(SettingsErrorKind::InvalidValue, "Unknown model preset.")
                    })?;
                progress(app, SettingsApplyPhase::Downloading);
                download_preset_file(&preset)
                    .map_err(|error| SettingsError::new(SettingsErrorKind::Download, error))
            }
            ModelSelection::File { path } => {
                let file = Path::new(&path);
                if !file.is_file()
                    || file
                        .extension()
                        .and_then(|value| value.to_str())
                        .is_none_or(|ext| !ext.eq_ignore_ascii_case("bin"))
                {
                    return Err(SettingsError::new(
                        SettingsErrorKind::ModelLoad,
                        "Choose an existing whisper.cpp .bin model file.",
                    ));
                }
                Ok(path)
            }
        },
        |path| prepare_model(app, path),
    )?;

    progress(app, SettingsApplyPhase::Applying);
    let _commit = runtime.commit.lock().unwrap();
    let previous = syncer.snapshot::<AppState>("app_state");
    let mut next = previous.clone();
    prepared.snapshot.values.write_to(&mut next);
    next.model_path = prepared.snapshot.model_path.clone();
    let store = app
        .store(StateSyncerConfig::default().filename)
        .map_err(|error| SettingsError::new(SettingsErrorKind::Save, error))?;
    store.set("app_state", serde_json::json!(next));
    if let Err(error) = store.save() {
        store.set("app_state", serde_json::json!(previous));
        return Err(SettingsError::new(SettingsErrorKind::Save, error));
    }

    let manager = app.state::<SharedWhisperManager>();
    let mut next_runtime = None;
    let mut next_vad = None;
    if let Some(model) = prepared.model {
        *manager.lock().unwrap() = Some(model.manager);
        next_runtime = Some(model.runtime);
        next_vad = Some(model.vad);
    } else if next.advanced_settings.hallucination_protection_enabled
        != previous.advanced_settings.hallucination_protection_enabled
    {
        next_vad = Some(
            if manager
                .lock()
                .unwrap()
                .as_ref()
                .is_some_and(WhisperManager::vad_available)
            {
                VadRuntimeState::ready()
            } else {
                VadRuntimeState::degraded("Silero VAD is unavailable")
            },
        );
    }
    if !next.advanced_settings.hallucination_protection_enabled {
        next_vad = Some(VadRuntimeState::disabled());
    }
    let ws = app.state::<WebsocketManager>();
    syncer.update("app_state", next.clone(), true);
    if next_runtime.is_some() || next_vad.is_some() {
        let internal_ref = syncer.get::<InternalState>("internal_state");
        {
            let mut internal = internal_ref.lock().unwrap();
            if let Some(runtime) = next_runtime {
                internal.runtime_dependency = runtime;
            }
            if let Some(vad) = next_vad {
                internal.vad_runtime = vad;
            }
        }
        drop(internal_ref);
        let response = WebsocketManager::to_ws_response(
            "internal_state_update".to_owned(),
            syncer.snapshot::<InternalState>("internal_state"),
        );
        if let Ok(message) = serde_json::to_string(&response) {
            ws.inner().clone().broadcast(message);
        }
    }
    let response = WebsocketManager::to_ws_response("app_state_update".to_owned(), next);
    if let Ok(message) = serde_json::to_string(&response) {
        ws.inner().clone().broadcast(message);
    }
    Ok(prepared.snapshot)
}

#[tauri::command]
#[specta::specta]
pub async fn apply_settings(
    app: AppHandle,
    request: SettingsRequest,
) -> Result<SettingsSnapshot, SettingsError> {
    tauri::async_runtime::spawn_blocking(move || apply(&app, request))
        .await
        .map_err(|error| SettingsError::new(SettingsErrorKind::Internal, error))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn current() -> SettingsSnapshot {
        SettingsSnapshot::from(&AppState {
            model_path: "/models/current.bin".into(),
            ..AppState::default()
        })
    }
    fn request() -> SettingsRequest {
        SettingsRequest {
            values: current().values,
            model: None,
        }
    }

    #[test]
    fn tuning_can_apply_live_without_loading_a_model() {
        let mut request = request();
        request.values.audio_segment_size = 22;
        let result = prepare_change::<()>(
            request,
            &current(),
            true,
            |_| panic!("unexpected download"),
            |_| panic!("unexpected load"),
        )
        .unwrap();
        assert_eq!(result.snapshot.values.audio_segment_size, 22);
        assert_eq!(result.snapshot.model_path, current().model_path);
    }

    #[test]
    fn source_and_model_changes_are_rejected_live_before_preparation() {
        for model in [false, true] {
            let mut request = request();
            if model {
                request.model = Some(ModelSelection::Preset {
                    id: "tiny-q8_0".into(),
                });
            } else {
                request.values.current_device.id = "other".into();
            }
            let error = prepare_change::<()>(
                request,
                &current(),
                true,
                |_| panic!("unexpected download"),
                |_| panic!("unexpected load"),
            )
            .err()
            .unwrap();
            assert_eq!(error.kind, SettingsErrorKind::Running);
        }
    }

    #[test]
    fn failed_model_preparation_keeps_the_original_settings() {
        for kind in [SettingsErrorKind::Download, SettingsErrorKind::ModelLoad] {
            let original = current();
            let mut request = request();
            request.values.audio_segment_size = 33;
            request.model = Some(ModelSelection::Preset {
                id: "tiny-q8_0".into(),
            });
            let error = prepare_change::<()>(
                request,
                &original,
                false,
                |_| {
                    if kind == SettingsErrorKind::Download {
                        Err(SettingsError::new(kind, "offline"))
                    } else {
                        Ok("/models/new.bin".into())
                    }
                },
                |_| Err(SettingsError::new(kind, "invalid model")),
            )
            .err()
            .unwrap();
            assert_eq!(error.kind, kind);
            assert_eq!(original.values.audio_segment_size, 15);
            assert_eq!(original.model_path, "/models/current.bin");
        }
    }

    #[test]
    fn a_resolved_current_model_does_not_reload() {
        let mut request = request();
        request.model = Some(ModelSelection::File {
            path: current().model_path,
        });
        let result = prepare_change::<()>(
            request,
            &current(),
            false,
            |_| Ok(current().model_path),
            |_| panic!("unexpected load"),
        )
        .unwrap();
        assert!(result.model.is_none());
    }

    #[test]
    fn rejects_invalid_segment_lengths() {
        for size in [0, 4, 61, u64::MAX] {
            let mut request = request();
            request.values.audio_segment_size = size;
            let error =
                prepare_change::<()>(request, &current(), false, |_| panic!(), |_| panic!())
                    .err()
                    .unwrap();
            assert_eq!(error.kind, SettingsErrorKind::InvalidValue);
        }
    }

    #[test]
    fn merging_settings_preserves_other_page_preferences() {
        let mut state = AppState::default();
        state.sidebar_open = false;
        state.overlay_config.style.font_size = 65;
        let mut values = SettingsValues::from(&state);
        values.audio_segment_size = 24;
        values.write_to(&mut state);
        assert!(!state.sidebar_open);
        assert_eq!(state.overlay_config.style.font_size, 65);
        assert_eq!(state.audio_segment_size, 24);
    }

    #[test]
    fn obsolete_language_fields_cannot_break_or_override_saved_settings() {
        for language in [serde_json::json!("ru"), serde_json::json!({"invalid":true})] {
            let state: AppState = serde_json::from_value(serde_json::json!({
                "sidebar_open": false,
                "audio_segment_size": 23,
                "whisper_params": {"language": language, "toggles": {"translate": [true], "print_special": true}}
            })).unwrap();
            assert!(!state.sidebar_open);
            assert_eq!(state.audio_segment_size, 23);
            assert!(state.whisper_params.toggles.print_special);
            assert!(state.whisper_params.toggles.token_timestamps);
            let saved = serde_json::to_value(state).unwrap();
            assert!(saved["whisper_params"].get("language").is_none());
            assert!(saved["whisper_params"]["toggles"]
                .get("translate")
                .is_none());
        }
    }

    #[test]
    fn operation_gate_rejects_competing_start_or_apply_without_waiting() {
        let runtime = SettingsRuntime::default();
        let operation = runtime.operation.try_lock().unwrap();
        assert!(runtime.operation.try_lock().is_err());
        assert!(runtime.commit.try_lock().is_ok());
        drop(operation);
        assert!(runtime.operation.try_lock().is_ok());
    }
}
