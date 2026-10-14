import pytest
from tests.support.python.audio import AudioProbe, PrivateAudio
from tests.support.python.processes import wait_for

@pytest.fixture
def audio_server(request, artifacts):
    with PrivateAudio(artifacts, backend=request.config.getoption("--audio-backend"),
                      pulse_prefix=request.config.getoption("--pulse-prefix")) as server:
        yield server

@pytest.fixture
def audio_probe(request, audio_server):
    probe = AudioProbe(audio_server, request.config.getoption("--audio-probe"))
    wait_for(lambda: any(d["id"] == "pulse:source:mic" for d in probe.listed()), "Virtual input did not appear")
    return probe

@pytest.fixture
def signals(audio_server, audio_probe):
    audio_server.start_tones()
    return audio_probe
