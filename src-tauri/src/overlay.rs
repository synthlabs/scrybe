use crate::{types::OverlayConfig, ws::WebsocketManager};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use tauri_svelte_synced_store::StateSyncer;

#[derive(Clone, Debug, Default, Deserialize, Serialize, specta::Type)]
#[serde(default)]
pub struct OverlayTestState {
    pub id: String,
    pub config: Option<OverlayConfig>,
    pub text: String,
    pub started_at_ms: u64,
    pub expires_at_ms: u64,
    pub revision: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

impl OverlayTestState {
    fn clear(&mut self, id: &str) -> bool {
        if self.id != id || self.config.is_none() {
            return false;
        }
        self.config = None;
        self.text.clear();
        self.expires_at_ms = 0;
        self.revision += 1;
        true
    }

    fn update(
        &mut self,
        id: &str,
        revision: u64,
        config: OverlayConfig,
        text: String,
        now: u64,
    ) -> bool {
        if self.id != id
            || self.config.is_none()
            || self.expires_at_ms <= now
            || revision <= self.revision
        {
            return false;
        }
        self.config = Some(config);
        self.text = text;
        self.revision = revision;
        true
    }
}

fn broadcast(store: &StateSyncer, ws: &WebsocketManager) {
    store.emit::<OverlayTestState>("overlay_test");
    let response = WebsocketManager::to_ws_response(
        "overlay_test_update".to_owned(),
        store.snapshot::<OverlayTestState>("overlay_test"),
    );
    if let Ok(data) = serde_json::to_string(&response) {
        ws.clone().broadcast(data);
    }
}

fn clear(store: &StateSyncer, ws: &WebsocketManager, id: &str) -> bool {
    let state = store.get::<OverlayTestState>("overlay_test");
    let Ok(mut guard) = state.lock() else {
        return false;
    };
    if !guard.clear(id) {
        return false;
    }
    drop(guard);
    broadcast(store, ws);
    true
}

#[tauri::command]
#[specta::specta]
pub fn start_overlay_test(
    config: OverlayConfig,
    text: String,
    state_syncer: State<'_, StateSyncer>,
    ws_manager: State<'_, WebsocketManager>,
) -> Result<OverlayTestState, String> {
    let started_at_ms = now_ms();
    let mut next = OverlayTestState {
        id: uuid::Uuid::new_v4().to_string(),
        config: Some(config),
        text,
        started_at_ms,
        expires_at_ms: started_at_ms + 60_000,
        revision: 0,
    };
    let state = state_syncer.get::<OverlayTestState>("overlay_test");
    let mut guard = state.lock().map_err(|error| error.to_string())?;
    next.started_at_ms = next.started_at_ms.max(guard.started_at_ms + 1);
    next.expires_at_ms = next.started_at_ms + 60_000;
    *guard = next.clone();
    drop(guard);
    broadcast(&state_syncer, &ws_manager);
    let store = state_syncer.inner().clone();
    let ws = ws_manager.inner().clone();
    let id = next.id.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        clear(&store, &ws, &id);
    });
    Ok(next)
}

#[tauri::command]
#[specta::specta]
pub fn update_overlay_test(
    id: String,
    revision: u64,
    config: OverlayConfig,
    text: String,
    state_syncer: State<'_, StateSyncer>,
    ws_manager: State<'_, WebsocketManager>,
) -> bool {
    let state = state_syncer.get::<OverlayTestState>("overlay_test");
    let Ok(mut guard) = state.lock() else {
        return false;
    };
    let accepted = guard.update(&id, revision, config, text, now_ms());
    drop(guard);
    if accepted {
        broadcast(&state_syncer, &ws_manager);
    }
    accepted
}

#[tauri::command]
#[specta::specta]
pub fn stop_overlay_test(
    id: String,
    state_syncer: State<'_, StateSyncer>,
    ws_manager: State<'_, WebsocketManager>,
) -> bool {
    clear(&state_syncer, &ws_manager, &id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn active_test(id: &str) -> OverlayTestState {
        OverlayTestState {
            id: id.into(),
            config: Some(OverlayConfig::default()),
            text: "sample captions".into(),
            started_at_ms: 100,
            expires_at_ms: 60_100,
            revision: 3,
        }
    }

    #[test]
    fn expiry_clears_an_active_test() {
        let mut state = active_test("test");
        assert!(!state.update(
            "test",
            4,
            OverlayConfig::default(),
            "late".into(),
            state.expires_at_ms,
        ));
        assert!(state.clear("test"));
        assert!(state.config.is_none());
        assert!(state.text.is_empty());
        assert_eq!(state.expires_at_ms, 0);
        assert_eq!(state.revision, 4);
        assert_eq!(state.id, "test");
        assert_eq!(state.started_at_ms, 100);
    }

    #[test]
    fn expiry_after_stop_does_not_clear_or_increment_revision_again() {
        let mut state = active_test("test");
        assert!(state.clear("test"));
        let stopped = serde_json::to_value(&state).unwrap();
        assert!(!state.clear("test"));
        assert_eq!(serde_json::to_value(&state).unwrap(), stopped);
    }

    #[test]
    fn old_expiry_cannot_clear_a_newer_test() {
        let mut state = active_test("old");
        assert!(state.clear("old"));
        state = active_test("new");
        let newer = serde_json::to_value(&state).unwrap();
        assert!(!state.clear("old"));
        assert_eq!(serde_json::to_value(&state).unwrap(), newer);
        assert!(state.clear("new"));
    }

    #[test]
    fn updates_cannot_revive_expired_tests_or_overwrite_newer_edits() {
        let mut state = OverlayTestState {
            id: "test".into(),
            config: Some(OverlayConfig::default()),
            expires_at_ms: 1000,
            ..Default::default()
        };
        assert!(state.update("test", 2, OverlayConfig::default(), "new".into(), 100));
        assert_eq!(state.expires_at_ms, 1000);
        assert!(!state.update("test", 1, OverlayConfig::default(), "old".into(), 100));
        assert!(!state.update("other", 3, OverlayConfig::default(), "other".into(), 100));
        assert!(!state.update("test", 3, OverlayConfig::default(), "late".into(), 1000));
        assert_eq!(state.text, "new");
    }
}
