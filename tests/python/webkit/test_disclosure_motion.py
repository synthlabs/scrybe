"""Distinct disclosure cases from the two authored WebKit suites."""
import pytest

pytestmark = pytest.mark.webkit
CASES = [
    ("overlay", "en", 1300, 900, 16, False),
    ("overlay", "ru", 880, 560, 16, False),
    ("overlay", "ru", 880, 560, 32, False),
    ("overlay", "en", 390, 844, 16, False),
    ("overlay", "en", 1300, 900, 16, True),
    ("home", "en", 1300, 900, 16, False),
    ("home", "ru", 880, 560, 16, False),
    ("home", "en", 1300, 900, 16, True),
    ("settings", "en", 1300, 900, 16, False),
]

def script(kind):
    return """void (async () => {
        const options = window.motionCase;
        try {
            const {inspectWebKitCase} = await import('/tests/support/browser/webkit-probes.ts');
            window.motionProbeResult = JSON.stringify(await inspectWebKitCase(options, KIND));
        } catch (error) {
            window.motionProbeResult = JSON.stringify({id:options.id, options, errors:[String(error)], stack:error.stack});
        }
    })()""".replace("KIND", repr(kind))

@pytest.mark.parametrize("scope,locale,width,height,font,reduced", CASES)
def test_disclosure_motion(webview, scope, locale, width, height, font, reduced):
    options = dict(id=0, scope=scope, locale=locale, width=width, height=height, font=font, reduced=reduced,
                   stress=scope == "overlay" and locale == "en" and width == 1300 and not reduced)
    webview.run(options, script("settings-disclosures" if scope == "settings" else "disclosures"),
                "settings" if scope == "settings" else "overlay", "/settings" if scope == "settings" else "/overlay" if scope == "overlay" else "/")
