"""Options and fixtures shared by the selected Python suites."""
import os
from pathlib import Path
import uuid
import pytest
from tests.support.python.processes import ROOT
from tests.support.python.profiles import fixture_data, model_path
from tests.support.python.server import ProbeServer

def pytest_addoption(parser):
    group = parser.getgroup("scrybe")
    group.addoption("--model", default=os.environ.get("SCRYBE_TEST_MODEL"))
    group.addoption("--vad-model", default=os.environ.get("SCRYBE_TEST_VAD_MODEL"))
    group.addoption("--native-binary", type=Path, default=ROOT / "target/debug/scrybe")
    group.addoption("--audio-probe", type=Path, default=ROOT / "target/debug/audio_probe")
    group.addoption("--audio-backend", choices=["pipewire", "pulseaudio"], default="pipewire")
    group.addoption("--pulse-prefix", type=Path, default=os.environ.get("SCRYBE_TEST_PULSE_PREFIX"))
    group.addoption("--audio-lifecycle-runs", type=int, default=21)
    group.addoption("--probe-root", type=Path, default=ROOT)
    group.addoption("--probe-port", type=int, default=0)
    group.addoption("--probe-timeout", type=float, default=60)
    group.addoption("--preview-source", type=Path)
    group.addoption("--motion-repetitions", type=int, default=1)
    group.addoption("--motion-width", type=int, default=1300)
    group.addoption("--motion-height", type=int, default=900)
    group.addoption("--motion-font", type=int, default=16)
    group.addoption("--motion-locale", choices=["en", "ru"], default="en")
    group.addoption("--motion-reduced", action="store_true")

def pytest_configure(config):
    for name in ["--probe-timeout", "--motion-repetitions", "--motion-width", "--motion-height", "--motion-font", "--audio-lifecycle-runs"]:
        if config.getoption(name) <= 0:
            raise pytest.UsageError(name + " must be positive")
    if not 0 <= config.getoption("--probe-port") <= 65535:
        raise pytest.UsageError("--probe-port must be between 0 and 65535")

@pytest.fixture
def artifacts(request):
    directory = ROOT / "target/test-results/python" / request.node.nodeid.replace("/", "-").replace("::", "-") / uuid.uuid4().hex
    directory.mkdir(parents=True, exist_ok=True)
    request.node.user_properties.append(("artifacts", str(directory)))
    return directory

@pytest.fixture(scope="session")
def app_fixtures(request):
    return fixture_data(request.config.getoption("--probe-root"))

@pytest.fixture(scope="session")
def whisper_model(request):
    return model_path(request.config.getoption("--model"))

@pytest.fixture(scope="session")
def vad_model(request):
    return model_path(request.config.getoption("--vad-model"), "SCRYBE_TEST_VAD_MODEL")

@pytest.fixture
def probe_server(request, artifacts):
    config = request.config
    with ProbeServer(artifacts, root=config.getoption("--probe-root"),
                     port=config.getoption("--probe-port"),
                     timeout=config.getoption("--probe-timeout"),
                     preview_source=config.getoption("--preview-source")) as server:
        yield server

@pytest.fixture
def webview(request, artifacts, probe_server, app_fixtures):
    from tests.support.python.webview import WebView
    with WebView(probe_server, artifacts, app_fixtures["tauriSources"],
                 timeout=request.config.getoption("--probe-timeout")) as view:
        yield view
