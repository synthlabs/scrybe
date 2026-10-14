"""A Vite process whose identity belongs to this test."""
import json
from pathlib import Path
import time
import subprocess
import urllib.request
import uuid
from .processes import ROOT, ProcessOwner, read_line, save

class ProbeServer(ProcessOwner):
    def __init__(self, artifacts, root=ROOT, port=0, timeout=60, bootstrap=None,
                 locale="en", case_count=1, preview_source=None):
        super().__init__(artifacts, root=root)
        self.port = port
        self.timeout = timeout
        for required in ["vite.config.js", "node_modules/vite/dist/node/index.js", "utils/js/hooks/is-mobile.svelte.ts"]:
            if not (self.root / required).is_file():
                raise RuntimeError(f"Missing {self.root / required}; prepare this worktree before running tests")
        if preview_source and not Path(preview_source).is_file():
            raise RuntimeError(f"Missing PreviewFrame override: {preview_source}")
        self.identity = {"token": uuid.uuid4().hex, "root": str(self.root.resolve()), "port": port,
                         "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.root, text=True).strip()}
        self.config = {"root": str(self.root.resolve()), "artifacts": str(self.artifacts.resolve()),
                       "identity": self.identity, "bootstrap": bootstrap.replace("PROBE_TOKEN", self.identity["token"]) if bootstrap else None, "locale": locale,
                       "caseCount": case_count, "previewSource": str(preview_source) if preview_source else None}
        self.completed = 0

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}"

    def __enter__(self):
        try:
            config = save(self.artifacts / "server-config.json", self.config)
            self.process = self.spawn(["node", ROOT / "tests/support/browser/probe-server.mjs", config], "vite", stdout=-1, text=True)
            deadline = time.monotonic() + self.timeout
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError(f"Vite exited with {self.process.returncode}; inspect {self.artifacts / 'vite.log'}")
                if self.port:
                    try:
                        with urllib.request.urlopen(self.url + "/__motion_probe__/identity", timeout=1) as response:
                            found = json.load(response)
                        if found != self.identity:
                            raise RuntimeError("The port belongs to a different probe server")
                    except OSError:
                        pass
                line = read_line(self.process, timeout=max(0.001, deadline - time.monotonic()))
                if line.startswith("motion-probe-ready "):
                    found = json.loads(line.removeprefix("motion-probe-ready "))
                    expected = {**self.identity, "port": found["port"]}
                    if found != expected:
                        raise RuntimeError("Vite returned a different probe server identity")
                    self.port = found["port"]
                    self.identity = found
                    with urllib.request.urlopen(self.url + "/__motion_probe__/identity", timeout=1) as response:
                        if json.load(response) != self.identity:
                            raise RuntimeError("The port belongs to a different probe server")
                    save(self.artifacts / "identity.json", self.identity)
                    return self
            raise RuntimeError("Vite startup timed out")
        except BaseException as error:
            save(self.artifacts / "result.json", {"passed": False, "completed": 0, "errors": [str(error)]})
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *arguments):
        super().__exit__(*arguments)
