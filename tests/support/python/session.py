"""Native session checks using a private input and a test-owned profile."""
from copy import deepcopy
import json
from .accessibility import NativeApp
from .processes import ROOT, save

MESSAGES = [json.loads((ROOT / f"messages/{locale}.json").read_text()) for locale in ["en", "ru"]]

def names(key):
    return [MESSAGES[0][key], MESSAGES[1][key]]

class SessionHarness:
    def __init__(self, artifacts, binary, model, defaults, audio, root=ROOT):
        self.artifacts = artifacts
        self.binary = binary
        self.model = model
        self.defaults = defaults
        self.audio = audio
        self.root = root
        self.results = []
        self.app = None

    def __enter__(self):
        return self

    def start_case(self, name, stall="", pulse_server=None):
        self.profile = self.artifacts / name
        initial = deepcopy(self.defaults)
        initial["current_device"] = {"id": "pulse:source:mic", "name": "Session test microphone"}
        environment = {
            "PULSE_SERVER": pulse_server or self.audio.environment["PULSE_SERVER"],
            "SCRYBE_SESSION_TEST_STALL": stall,
            "SCRYBE_SESSION_TEST_RELEASE": str(self.profile / "release"),
            "LANG": "en_US.UTF-8",
        }
        self.app = NativeApp(self.profile, self.binary, self.model, initial, environment, root=self.root)
        self.app.start()
        self.wait(lambda: self.find(names("header_start_captions")), "Native window did not become ready", 45)
        assert self.app.process.poll() is None, f"App exited with {self.app.process.returncode}; inspect {self.profile}"

    def find(self, labels, role=None, index=0):
        return self.app.find(labels, role, index, actionable=True, enabled=True)

    def activate(self, labels, role=None, index=0):
        return self.app.activate(labels, role, index)

    def wait(self, check, message, budget=15):
        return self.app.wait(check, message, timeout=budget)

    def state(self):
        return self.app.state()

    def idle(self):
        internal = self.state().get("internal_state", {})
        return internal and not internal["transcribe_starting"] and not internal["transcribe_running"]

    def running(self):
        return self.state().get("internal_state", {}).get("transcribe_running", False)

    def log_text(self):
        return self.app.log_text()

    def workers(self):
        return self.app.workers()

    def record(self, name, elapsed=None):
        self.results.append({"check": name, "elapsed_seconds": elapsed})
        save(self.artifacts / "completed-checks.json", self.results)

    def reset_check(self, label):
        import time
        before = self.log_text().count("session startup requested")
        started = self.activate(names("home_toolbar_new_session"))
        self.wait(self.idle, f"{label}: reset did not become idle", 2)
        elapsed = time.monotonic() - started
        assert elapsed < 2, elapsed
        time.sleep(0.2)
        assert self.log_text().count("session startup requested") == before, "New Session invoked Start"
        self.record(label, elapsed)

    def close_case(self, label):
        elapsed = self.app.close_window()
        self.record(label, elapsed)

    def __exit__(self, *arguments):
        if self.app:
            self.app.__exit__(*arguments)
        save(self.artifacts / "completed-checks.json", self.results)
