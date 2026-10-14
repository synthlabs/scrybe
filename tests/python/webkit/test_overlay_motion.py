import pytest
from .test_disclosure_motion import script
pytestmark = pytest.mark.webkit

def motion_options(request, scope, index=0):
    c = request.config
    return dict(id=index, scope=scope, locale=c.getoption("--motion-locale"),
                width=c.getoption("--motion-width"), height=c.getoption("--motion-height"),
                font=c.getoption("--motion-font"), reduced=c.getoption("--motion-reduced"))

@pytest.mark.parametrize("scope", ["overlay", "overlay-trace"])
def test_overlay_scroll_motion(webview, request, scope):
    for index in range(request.config.getoption("--motion-repetitions")):
        webview.run(motion_options(request, scope, index), script("reproduction"), "overlay", "/overlay")
