import pytest
from tests.support.python.processes import save
pytestmark = pytest.mark.audio

def test_catalog_defaults_duplicate_names_and_monitor_filtering(audio_server, audio_probe):
    devices = audio_probe.listed()
    save(audio_server.artifacts / "devices.json", devices)
    assert {d["id"] for d in devices} == {"", "default:output", "pulse:source:mic", "pulse:sink:first", "pulse:sink:second"}, devices
    assert next(d for d in devices if d["id"] == "pulse:source:mic")["name"] == "Studio"
    assert next(d for d in devices if d["id"] == "pulse:sink:first")["name"] == "Studio"
