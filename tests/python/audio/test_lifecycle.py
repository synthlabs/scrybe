import time
import pytest
from tests.support.python.audio import StalledPulse
pytestmark = pytest.mark.audio

def test_lifecycle_has_no_thread_or_descriptor_leaks(request, audio_server, signals):
    runs = request.config.getoption("--audio-lifecycle-runs")
    result = audio_server.run([signals.binary, "lifecycle", "--id", "pulse:sink:second", "--runs", runs], timeout=10 + runs / 5)
    (audio_server.artifacts / "lifecycle.json").write_text(result.stdout)
    (audio_server.artifacts / "lifecycle.log").write_text(result.stderr)

@pytest.mark.parametrize("device", ["alsa:null", "pulse:source:missing", "pulse:sink:missing"])
def test_unsupported_or_missing_devices_never_become_ready(audio_server, audio_probe, device):
    result = audio_server.run([audio_probe.binary, "capture", "--id", device], check=False)
    assert result.returncode != 0 and '"event":"ready"' not in result.stdout

def test_removed_source_stops_capture(audio_server, signals):
    process, _ = signals.capture("pulse:sink:first", seconds=15, name="removed")
    audio_server.pactl("unload-module", audio_server.first_module)
    process.communicate(timeout=5)
    assert process.returncode != 0, "Removed source did not stop capture"

def test_stopped_service_stops_capture(audio_server, signals):
    process, _ = signals.capture("pulse:sink:second", seconds=15, name="server-stopped")
    audio_server.service.terminate()
    process.communicate(timeout=5)
    assert process.returncode != 0, "Stopped audio service did not stop capture"

@pytest.mark.parametrize("command", ["list", "cancel-startup"])
def test_unresponsive_service_deadline_and_cancellation(audio_server, audio_probe, command):
    with StalledPulse(timeout=8) as stalled:
        start = time.monotonic()
        result = audio_server.run([audio_probe.binary, command], check=False,
                                  environment={**audio_server.environment, "PULSE_SERVER": f"unix:{stalled.path}"})
        elapsed = time.monotonic() - start
        if command == "list":
            assert result.returncode != 0 and 4.5 <= elapsed < 7, (elapsed, result.stderr)
        else:
            assert result.returncode == 0 and elapsed < 2, (elapsed, result.stderr)
