"""Real Tauri motion probes, including trace and retained advanced state."""
import json
from urllib.parse import urlparse
import urllib.request
import pytest
from tests.support.python.accessibility import NativeApp
from tests.support.python.processes import save
from tests.support.python.server import ProbeServer
pytestmark = pytest.mark.native

@pytest.mark.parametrize("scope", ["overlay", "overlay-trace", "settings", "settings-preopen"])
def test_native_motion(request, artifacts, native_binary, whisper_model, scope):
    repetitions = request.config.getoption("--motion-repetitions")
    root = request.config.getoption("--probe-root").resolve()
    locale = request.config.getoption("--motion-locale")
    dimensions = tuple(request.config.getoption(name) for name in ["--motion-width", "--motion-height", "--motion-font", "--motion-reduced"])
    if dimensions != (1300, 900, 16, False):
        raise RuntimeError("Native mode verifies the default window and motion settings")
    if repetitions < 1:
        raise RuntimeError("--motion-repetitions must be positive")
    cases = [dict(id=index, scope=scope, locale=locale, width=1300, height=900, font=16, reduced=False, native=True, root=str(root))
             for index in range(repetitions)]
    bootstrap = """void (async () => {
        const {inspectWebKitCase} = await import('/tests/support/browser/webkit-probes.ts');
        const {waitFor} = await import('/tests/support/browser/motion-repro.ts');
        for (const options of CASES) {
            let report;
            try {
                const path = options.scope.startsWith('overlay') ? '/overlay' : '/settings';
                if (location.pathname !== path) {
                    const link = await waitFor(() => document.querySelector('a[href="' + path + '"]'), 'Navigation link missing');
                    link.click();
                }
                report = await inspectWebKitCase(options, 'reproduction');
            } catch (error) {
                report = {id:options.id, options, errors:[String(error)], stack:error.stack};
            }
            await fetch('/__motion_probe__/result?token=PROBE_TOKEN', {method:'POST',
                headers:{'Content-Type':'application/json'}, body:JSON.stringify(report)});
        }
    })().catch(error => fetch('/__motion_probe__/result?token=PROBE_TOKEN', {method:'POST',
        body:JSON.stringify({id:0, options:CASES[0], errors:[String(error)], stack:error.stack})}));""".replace("CASES", json.dumps(cases))
    dev_url = urlparse(json.loads((root / "src-tauri/tauri.conf.json").read_text())["build"]["devUrl"])
    with ProbeServer(artifacts, root=root, port=dev_url.port or 80, bootstrap=bootstrap, case_count=len(cases), locale=locale,
                     preview_source=request.config.getoption("--preview-source")) as server:
        document = urllib.request.Request(server.url + "/", headers={"Accept": "text/html"})
        with urllib.request.urlopen(document, timeout=30) as response:
            html = response.read().decode()
        (artifacts / "bootstrap.html").write_text(html)
        if 'id="motion-probe-bootstrap"' not in html:
            raise RuntimeError("Native probe bootstrap was not injected into the served page")
        with NativeApp(artifacts / "profile", native_binary, whisper_model, root=root) as app:
            app.start()
            results = []
            for index, options in enumerate(cases):
                path = artifacts / f"native-{index}.json"
                app.wait(lambda: path.exists(), f"Native motion case {index} timed out",
                         timeout=request.config.getoption("--probe-timeout"))
                report = json.loads(path.read_text())
                if report.get("id") != index or report.get("options") != options or not isinstance(report.get("errors"), list):
                    raise RuntimeError("Unexpected or malformed case result")
                results.append(report)
                assert not report["errors"], report["errors"]
            save(artifacts / "result.json", {"passed": True, "expected": len(cases), "completed": len(results)})
