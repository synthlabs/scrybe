import pytest
from tests.support.python.processes import save
pytestmark = pytest.mark.native

def test_native_overlay_navigation_and_disclosure(native_app, artifacts):
    app = native_app.start()
    app.wait(lambda: app.find(["Overlay", "Оверлей"], "link", actionable=True), "Could not find Overlay")
    app.activate(["Overlay", "Оверлей"], "link")
    app.wait(lambda: app.find(["Position & Size", "Положение и размер"], actionable=True), "Overlay did not expose its positioning disclosure")
    app.activate(["Position & Size", "Положение и размер"])
    app.activate(["Position & Size", "Положение и размер"])
    save(artifacts / "result.json", {"passed": True, "checks": ["Tauri startup", "Overlay navigation", "accessible positioning disclosure"]})
