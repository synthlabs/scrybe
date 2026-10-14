"""All five native stall/timeout scenarios from the authored suite."""
import time
import pytest
from tests.support.python.audio import StalledPulse
from tests.support.python.session import names
pytestmark = pytest.mark.native

def test_opening_timeout_cancellation_recovery_and_close(session_harness):
    h = session_harness
    h.start_case("opening", "opening_device")
    started = h.activate(names("header_start_captions"))
    h.wait(lambda: "session test stall entered" in h.log_text(), "Device stall hook not entered")
    h.wait(lambda: "kind=Timeout" in h.log_text() and h.idle(), "Full Start did not time out", 7)
    elapsed = time.monotonic() - started
    assert 4.5 <= elapsed < 6, elapsed
    h.record("five-second deadline while device opening never returns", elapsed)
    assert h.workers() == 1
    h.activate(names("header_start_captions"))
    h.wait(lambda: "WaitingForPreviousRun" in h.log_text(), "Retry did not wait for old worker")
    started = h.activate(names("audio_cancel_start"))
    h.wait(h.idle, "Cancel did not finish", 2)
    h.record("Cancel during previous-worker wait", time.monotonic() - started)
    assert h.workers() == 1
    h.reset_check("New Session during stuck cleanup remains idle")
    (h.profile / "release").touch()
    h.wait(lambda: h.workers() == 0, "Released old worker did not exit", 3)
    assert h.idle(), "Late worker completion activated capture"
    h.activate(names("header_start_captions"))
    h.wait(h.running, "Manual retry did not recover", 5)
    h.record("manual retry after old worker exits")
    h.reset_check("New Session from running does not restart")
    h.wait(lambda: h.workers() == 0, "Stopped worker did not exit", 3)
    (h.profile / "release").unlink()
    h.activate(names("header_start_captions"))
    h.wait(lambda: h.workers() == 1, "Second startup did not reserve a worker")
    h.close_case("Close during permanently stalled startup")

def test_stream_start_timeout_reset_and_close(session_harness):
    h = session_harness
    h.start_case("stream", "starting_stream")
    started = h.activate(names("header_start_captions"))
    h.wait(lambda: "session test stall entered" in h.log_text(), "Stream stall hook not entered")
    h.wait(lambda: "kind=Timeout" in h.log_text() and h.idle(), "Stream startup did not time out", 7)
    elapsed = time.monotonic() - started
    assert 4.5 <= elapsed < 6, elapsed
    h.record("five-second deadline while stream start never returns", elapsed)
    h.reset_check("New Session after stream timeout")
    h.close_case("Close after stream startup timeout")

def test_busy_inference_rejects_restart_and_settings_without_persistence(session_harness):
    h = session_harness
    h.start_case("inference", "inference")
    h.activate(names("header_start_captions"))
    h.wait(lambda: "session test stall entered" in h.log_text(), "Inference stall hook not entered", 10)
    started = h.activate(names("header_stop_captions"))
    h.wait(h.idle, "Stop waited for inference", 2)
    h.record("Stop while inference holds the model", time.monotonic() - started)
    started = h.activate(names("header_start_captions"))
    h.wait(lambda: "kind=Timeout" in h.log_text() and h.idle(), "Restart waited indefinitely for inference", 7)
    elapsed = time.monotonic() - started
    assert 4.5 <= elapsed < 6, elapsed
    h.record("five-second restart deadline during stuck inference", elapsed)
    assert h.workers() == 1
    h.activate(names("sidebar_settings"), "link")
    h.activate(names("settings_advanced"), index=1)
    before = h.state()["app_state"]
    toggle = h.wait(lambda: h.find(names("settings_hallucination_protection_label")), "Protection toggle not found")
    checked = toggle.get_state_set().contains(h.app.Atspi.StateType.CHECKED)
    h.activate(names("settings_hallucination_protection_label"))
    h.wait(lambda: h.find(names("settings_hallucination_protection_label")).get_state_set().contains(h.app.Atspi.StateType.CHECKED) != checked, "Protection toggle did not change")
    started = h.activate(names("settings_apply"))
    h.wait(lambda: h.app.text_present(names("settings_error_model_busy")), "Settings did not report the busy model", 2)
    time.sleep(0.2)
    assert h.state()["app_state"] == before, "Busy model changed persisted settings"
    assert time.monotonic() - started < 2
    h.record("settings needing the busy model reject before persistence")
    h.activate(names("settings_discard"))
    h.activate(names("sidebar_home"), "link")
    h.reset_check("New Session during stuck inference")
    h.close_case("Close while inference holds the model")

def test_cleanup_stall_stop_restart_deadline_and_close(session_harness):
    h = session_harness
    h.start_case("cleanup", "cleanup")
    h.activate(names("header_start_captions"))
    h.wait(h.running, "Capture did not start", 5)
    started = h.activate(names("header_stop_captions"))
    h.wait(h.idle, "Stop waited for cleanup", 2)
    h.record("Stop does not wait for cleanup", time.monotonic() - started)
    h.wait(lambda: "session test stall entered" in h.log_text(), "Cleanup stall hook not entered")
    started = h.activate(names("header_start_captions"))
    h.wait(lambda: "kind=Timeout" in h.log_text() and h.idle(), "Cleanup wait did not time out", 7)
    h.record("restart deadline includes cleanup", time.monotonic() - started)
    assert h.workers() == 1
    h.close_case("Close during permanently stalled cleanup")

def test_real_audio_service_timeout_reaches_ui_and_close(session_harness):
    h = session_harness
    with StalledPulse() as stalled:
        h.start_case("service-timeout", pulse_server=f"unix:{stalled.path}")
        started = h.activate(names("header_start_captions"))
        h.wait(lambda: "kind=Timeout" in h.log_text() and h.idle(), "Unresponsive audio service did not time out", 7)
        elapsed = time.monotonic() - started
        assert 4.5 <= elapsed < 6, elapsed
        h.record("real Pulse connection timeout reaches the UI", elapsed)
        stalled.release.set()
        stalled.thread.join(timeout=2)
        h.close_case("Close after real audio-service timeout")
