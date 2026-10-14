"""Preserve probe failures before any WebKit window launches."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import pytest
from tests.support.python.server import ProbeServer

def failed_summary(artifacts):
    summary = json.loads((artifacts / "result.json").read_text())
    assert summary["passed"] is False and summary["completed"] == 0, summary
    return summary

def test_missing_worktree_fails_before_launch(tmp_path):
    missing = tmp_path / "missing-worktree"
    missing.mkdir()
    with pytest.raises(RuntimeError, match="Missing "):
        ProbeServer(tmp_path / "artifacts", root=missing)

class ForeignServer(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"token":"another-run"}')
    def log_message(self, *_):
        pass

@pytest.fixture
def foreign_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), ForeignServer)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive(), "Foreign server did not shut down"

def test_foreign_occupied_port_cannot_pass(tmp_path, foreign_server):
    artifacts = tmp_path / "artifacts"
    with pytest.raises(RuntimeError, match="different probe server|Vite exited"):
        with ProbeServer(artifacts, port=foreign_server.server_port):
            pytest.fail("A foreign server passed as test owned")
    failed_summary(artifacts)

def test_incomplete_startup_writes_failed_result(tmp_path):
    artifacts = tmp_path / "artifacts"
    with pytest.raises(RuntimeError, match="startup timed out"):
        with ProbeServer(artifacts, timeout=0.001):
            pytest.fail("Incomplete startup passed")
    failed_summary(artifacts)
