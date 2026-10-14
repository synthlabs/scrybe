"""The authored native persistence workflow in a synthetic profile."""
import time
import pytest
from tests.support.python.processes import save
pytestmark = pytest.mark.native

def test_settings_drafts_persistence_and_legacy_migration(native_app, whisper_model, artifacts):
    app = native_app
    initial = app.initial
    initial["whisper_params"]["language"] = {"obsolete": True}
    initial["whisper_params"]["toggles"].update(translate=[True], token_timestamps=True)
    initial["overlay_config"]["style"]["font_size"] = 77
    save(app.store, {"app_state": initial})
    def activate(labels, role=None, index=0):
        app.activate(labels, role, index)
        time.sleep(0.35)
    def start():
        app.start()
        activate(["Settings", "Настройки"], "link")
        app.wait(lambda: app.find(["Reset Advanced Settings", "Сбросить дополнительные настройки"]), "Settings did not load")
    saved = lambda: app.state()["app_state"]
    start()
    state = saved()
    assert state["audio_segment_size"] == 15
    assert "language" not in state["whisper_params"]
    assert "translate" not in state["whisper_params"]["toggles"]
    assert state["overlay_config"]["style"] == initial["overlay_config"]["style"]
    loaded_overlay = state["overlay_config"]
    activate(["Advanced", "Дополнительно"], index=1)
    toggle_names = ["Token Timestamps", "Временные метки токенов"]
    activate(toggle_names)
    checked = lambda: app.find(toggle_names, actionable=True).get_state_set().contains(app.Atspi.StateType.CHECKED)
    app.wait(lambda: not checked(), "The native toggle did not change")
    assert saved()["whisper_params"]["toggles"]["token_timestamps"], "Editing a draft wrote to disk."
    activate(["Discard", "Отменить изменения"])
    app.wait(checked, "Discard did not restore the toggle")
    activate(toggle_names)
    activate(["Apply", "Применить"])
    app.wait(lambda: not saved()["whisper_params"]["toggles"]["token_timestamps"], "Apply was not persisted")
    assert saved()["model_path"] == whisper_model
    assert saved()["overlay_config"] == loaded_overlay
    assert saved()["audio_segment_size"] == 15
    activate(toggle_names)
    activate(["Overlay", "Оверлей"], "link")
    activate(["Settings", "Настройки"], "link")
    app.wait(checked, "The draft did not survive navigation")
    app.stop_app()
    start()
    activate(["Advanced", "Дополнительно"], index=1)
    assert not checked(), "An unapplied draft survived reopening."
    save(artifacts / "result.json", {"passed": True})
