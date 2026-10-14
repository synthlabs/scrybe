import pytest
from .test_disclosure_motion import CASES, script
pytestmark = pytest.mark.webkit

@pytest.mark.parametrize("scope,locale,width,height,font,reduced", [case for case in CASES if case[0] == "overlay"])
def test_button_motion(webview, scope, locale, width, height, font, reduced):
    options = dict(id=0, scope=scope, locale=locale, width=width, height=height, font=font, reduced=reduced)
    webview.run(options, script("buttons"), "overlay", "/overlay")
