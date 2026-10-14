import json
import pytest
from tests.support.python.audio import assert_tone
pytestmark = pytest.mark.audio

@pytest.mark.parametrize("name,device,seconds,expected,other", [
    ("cold-start", "pulse:sink:first", 3, 440, 880),
    ("route-0", "pulse:sink:first", 2, 440, 880),
    ("route-1", "pulse:sink:second", 2, 880, 440),
    ("route-2", "pulse:source:mic", 2, 440, 880),
    ("route-3", "", 2, 440, 880),
])
def test_capture_routes(signals, name, device, seconds, expected, other):
    process, output = signals.capture(device, seconds=seconds, name=name)
    signals.finish(process)
    assert_tone(output, expected, other)

def test_default_is_pinned_until_next_start(audio_server, signals):
    process, output = signals.capture("default:output", seconds=3, name="default-pinned")
    audio_server.pactl("set-default-sink", "second")
    for stream in json.loads(audio_server.pactl("-f", "json", "list", "sink-inputs")):
        name = stream["properties"].get("application.name", "")
        if name in ["fixture-first", "fixture-second"]:
            audio_server.pactl("move-sink-input", str(stream["index"]), name.removeprefix("fixture-"))
    signals.finish(process)
    assert_tone(output, 440, 880)
    process, output = signals.capture("default:output", name="default-next-start")
    signals.finish(process)
    assert_tone(output, 880, 440)
