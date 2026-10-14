import pytest
from .test_disclosure_motion import script
from .test_overlay_motion import motion_options
pytestmark = pytest.mark.webkit

@pytest.mark.parametrize("scope", ["settings", "settings-preopen"])
def test_model_chooser_motion(webview, request, scope):
    for index in range(request.config.getoption("--motion-repetitions")):
        webview.run(motion_options(request, scope, index), script("reproduction"), "settings", "/settings")
