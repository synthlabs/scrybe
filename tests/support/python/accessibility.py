"""Accessibility operations scoped to the spawned app PID."""
from pathlib import Path
import subprocess
import time
import uuid
from .processes import ROOT, ProcessOwner, require_commands, save, stop, wait_for
from .profiles import native_profile
from .webview import gi_modules

def descendants(node, depth=0):
    if node is None or depth > 24:
        return
    yield node
    for index in range(node.get_child_count()):
        child = node.get_child_at_index(index)
        if child is not None:
            yield from descendants(child, depth + 1)

class NativeApp(ProcessOwner):
    def __init__(self, artifacts, binary, model=None, state=None, environment=None, root=ROOT):
        initial, self.store, native_environment = native_profile(artifacts, model, state, root=root)
        if environment:
            native_environment.update(environment)
        super().__init__(artifacts, environment=native_environment, root=root)
        self.initial = initial
        self.binary = Path(binary)
        if not self.binary.is_file():
            raise RuntimeError(f"Build the debug test app: cargo build --locked -p scrybe --features session-test-hooks ({self.binary})")
        self.Atspi, self.GLib = gi_modules(("Atspi", "2.0"), ("GLib", "2.0"))
        self.process = None
        self.script_name = "scrybe-test-" + uuid.uuid4().hex

    def application(self):
        desktop = self.Atspi.get_desktop(0)
        for index in range(desktop.get_child_count()):
            node = desktop.get_child_at_index(index)
            if node and node.get_process_id() == self.process.pid:
                return node

    def wait(self, check, message, timeout=15):
        def attempt():
            try:
                return check()
            except self.GLib.GError:
                return None
        return wait_for(attempt, message, timeout=timeout,
                        processes=[self.process] if self.process else (), interval=0.03)

    def find(self, names, role=None, index=0, actionable=False, enabled=False):
        app = self.application()
        if app is None:
            return None
        matches = [node for node in descendants(app) if node.get_name().strip() in names
                   and (role is None or node.get_role_name() == role)
                   and (not actionable or node.get_action_iface().get_n_actions() > 0)
                   and (not enabled or node.get_state_set().contains(self.Atspi.StateType.ENABLED))]
        return matches[index] if len(matches) > index else None

    def activate(self, names, role=None, index=0):
        node = self.wait(lambda: self.find(names, role, index, actionable=True, enabled=True), f"Missing control: {names}")
        started = time.monotonic()
        assert node.get_action_iface().do_action(0), names
        return started

    def text_present(self, labels):
        for node in descendants(self.application()):
            text = node.get_name()
            try:
                text += self.Atspi.Text.get_text(node, 0, -1)
            except self.GLib.GError:
                pass
            if any(label in text for label in labels):
                return True
        return False

    def start(self):
        if subprocess.run(["pgrep", "-x", "scrybe"], capture_output=True).returncode == 0:
            raise RuntimeError("Close the existing Scrybe instance before running native tests")
        self.process = self.spawn([self.binary], "native")
        self.wait(self.application, "Scrybe did not appear on the accessibility bus", timeout=45)
        return self

    def state(self):
        import json
        try:
            return json.loads(self.store.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def log_text(self):
        return (self.artifacts / "native.log").read_text(errors="replace")

    def workers(self):
        return sum(path.read_text().strip() == "scrybe-session"
                   for path in Path(f"/proc/{self.process.pid}/task").glob("*/comm"))

    def stop_app(self):
        stop(self.process)
        self.process = None

    def close_window(self):
        require_commands("qdbus6")
        script = self.artifacts / "close.js"
        script.write_text(f"for (const window of workspace.windowList()) {{ if (window.pid === {self.process.pid} && window.caption.startsWith('Scrybe')) window.closeWindow(); }}\n")
        loaded = subprocess.run(["qdbus6", "org.kde.KWin", "/Scripting", "loadScript", str(script), self.script_name],
                                capture_output=True, text=True, check=True)
        try:
            started = time.monotonic()
            subprocess.run(["qdbus6", "org.kde.KWin", f"/Scripting/Script{loaded.stdout.strip()}", "org.kde.kwin.Script.run"],
                           check=True, capture_output=True)
            self.process.wait(timeout=2)
            elapsed = time.monotonic() - started
            assert elapsed < 2 and self.process.returncode == 0, (elapsed, self.process.returncode)
            return elapsed
        finally:
            subprocess.run(["qdbus6", "org.kde.KWin", "/Scripting", "unloadScript", self.script_name], capture_output=True)

    def __exit__(self, *arguments):
        if self.process and self.process.poll() is None:
            try:
                save(self.artifacts / "accessibility.json", [{"name": node.get_name(), "role": node.get_role_name(),
                    "enabled": node.get_state_set().contains(self.Atspi.StateType.ENABLED)} for node in descendants(self.application())])
            except self.GLib.GError:
                pass
        super().__exit__(*arguments)
