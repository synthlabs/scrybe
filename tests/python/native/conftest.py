import json
import subprocess
from urllib.parse import urlparse
import pytest
from tests.support.python.accessibility import NativeApp
from tests.support.python.audio import PrivateAudio
from tests.support.python.processes import ROOT
from tests.support.python.server import ProbeServer

@pytest.fixture(scope="session")
def native_binary(request):
    # The default binary is rebuilt so binding exports stay disabled by session-test-hooks.
    binary = request.config.getoption("--native-binary")
    if binary == ROOT / "target/debug/scrybe":
        subprocess.run(["cargo", "build", "--locked", "-p", "scrybe", "--features", "session-test-hooks"],
                       cwd=ROOT, check=True)
    return binary

@pytest.fixture
def native_server(request, artifacts):
    root = request.config.getoption("--probe-root")
    url = urlparse(json.loads((root / "src-tauri/tauri.conf.json").read_text())["build"]["devUrl"])
    with ProbeServer(artifacts / "frontend", root=root, port=url.port or 80) as server:
        yield server

@pytest.fixture
def native_app(request, artifacts, native_server, native_binary, whisper_model):
    with NativeApp(artifacts, native_binary, whisper_model,
                   root=request.config.getoption("--probe-root")) as app:
        yield app

@pytest.fixture
def session_audio(artifacts):
    with PrivateAudio(artifacts / "audio") as audio:
        yield audio

@pytest.fixture
def session_harness(request, artifacts, native_server, native_binary, session_audio, whisper_model, app_fixtures):
    from tests.support.python.session import SessionHarness
    with SessionHarness(artifacts, native_binary, whisper_model,
                        app_fixtures["defaults"], session_audio,
                        root=request.config.getoption("--probe-root")) as harness:
        yield harness
