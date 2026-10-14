"""Startup liveness retained from the retired screenshot workflow."""
import time
import pytest
from tests.support.python.processes import save
from tests.support.python.session import names

pytestmark = pytest.mark.native

def test_native_startup_is_live_before_navigation(native_app, artifacts):
    started = time.monotonic()
    app = native_app.start()
    app.wait(lambda: app.find(names("sidebar_home"), "link", actionable=True), "Home navigation did not become available")
    time.sleep(max(0, 5 - (time.monotonic() - started)))
    assert app.process.poll() is None
    save(artifacts / "result.json", {"passed": True, "checks": ["startup", "liveness before navigation", "alive after 5 s"]})
