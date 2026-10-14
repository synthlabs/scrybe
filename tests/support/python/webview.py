"""WebKit windows and asynchronous probe results with owned cleanup."""
import json
import importlib
import os
from pathlib import Path
import time
from .processes import save

def gi_modules(*names):
    if os.name != "posix" or not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        raise RuntimeError("These tests require a Linux desktop session and system GI bindings; use .venv-native.")
    if os.environ.get("XDG_SESSION_TYPE") == "wayland" and Path("/sys/module/nvidia").exists():
        os.environ.setdefault("__NV_DISABLE_EXPLICIT_SYNC", "1")
    try:
        import gi
        for name, version in names:
            gi.require_version(name, version)
        return [importlib.import_module("gi.repository." + name) for name, _ in names]
    except (ImportError, ValueError) as error:
        raise RuntimeError("Install the requested system GI libraries and use the documented .venv-native setup.") from error

class WebView:
    def __init__(self, server, artifacts, tauri_sources, timeout=60):
        self.server = server
        self.artifacts = artifacts
        self.sources = tauri_sources
        self.timeout = timeout
        self.Gtk, self.WebKit2, self.GLib = gi_modules(("Gtk", "3.0"), ("WebKit2", "4.1"), ("GLib", "2.0"))
        ok, _ = self.Gtk.init_check()
        if not ok:
            raise RuntimeError("GTK could not connect to the desktop session")
        self.previous_animations = self.Gtk.Settings.get_default().get_property("gtk-enable-animations")
        self.windows = []

    def __enter__(self):
        return self

    def run(self, case, script, fixture, path):
        Gtk, WebKit2, GLib = self.Gtk, self.WebKit2, self.GLib
        manager = WebKit2.UserContentManager()
        context = WebKit2.WebContext.new_with_website_data_manager(WebKit2.WebsiteDataManager.new_ephemeral())
        view = WebKit2.WebView(web_context=context, user_content_manager=manager)
        window = Gtk.Window(title="Scrybe " + case["scope"] + " checks")
        window.add(view)
        self.windows.append(window)
        state = {"loaded": False, "pending": False, "finished": False, "report": None, "error": None}
        deadline = time.monotonic() + self.timeout
        options = dict(case)
        setup = self.sources[fixture] + "\nlocalStorage.clear();\n"
        setup += "localStorage.setItem('PARAGLIDE_LOCALE'," + json.dumps(case["locale"]) + ");\n"
        setup += "window.motionCase = " + json.dumps(options) + ";"
        manager.add_script(WebKit2.UserScript.new(setup, WebKit2.UserContentInjectedFrames.TOP_FRAME,
            WebKit2.UserScriptInjectionTime.START, None, None))
        Gtk.Settings.get_default().set_property("gtk-enable-animations", not case["reduced"])

        def fail(message):
            state["error"] = str(message)
            state["finished"] = True
            Gtk.main_quit()

        def on_load(webview, event):
            if state["finished"]:
                return
            if event == WebKit2.LoadEvent.STARTED:
                state["loaded"] = False
            if event == WebKit2.LoadEvent.FINISHED and not state["loaded"]:
                state["loaded"] = True
                webview.evaluate_javascript(script, -1, None, None, None, None, None)

        def on_result(webview, result, _):
            state["pending"] = False
            if state["finished"]:
                return
            try:
                value = webview.evaluate_javascript_finish(result)
                if not value.is_string():
                    raise RuntimeError("WebKit returned a non-string result")
                text = value.to_string()
                if not text:
                    return
                report = json.loads(text)
                if report.get("id") != options["id"] or report.get("options") != options or not isinstance(report.get("errors"), list):
                    raise RuntimeError("Unexpected or malformed case result")
                state["report"] = report
                state["finished"] = True
                Gtk.main_quit()
            except Exception as error:
                fail(error)

        def poll():
            if state["finished"]:
                return False
            if self.server.process.poll() is not None:
                fail("Vite exited while running a case")
            elif time.monotonic() > deadline:
                fail("WebKit case timed out: " + case["scope"])
            elif state["loaded"] and not state["pending"]:
                state["pending"] = True
                view.evaluate_javascript('window.motionProbeResult || ""', -1, None, None, None, on_result, None)
            return not state["finished"]

        window.connect("delete-event", lambda *_: fail("Probe window closed before completion"))
        view.connect("load-changed", on_load)
        timer = None
        try:
            window.set_default_size(case["width"], case["height"])
            window.show_all()
            view.load_uri(self.server.url + path + "?motion=" + str(case["id"]))
            timer = GLib.timeout_add(100, poll)
            Gtk.main()
            if state["error"]:
                raise RuntimeError(state["error"])
            report = state["report"]
            save(self.artifacts / ("case-" + str(case["id"]) + ".json"), report)
            self.server.completed += 1
            assert not report["errors"], report["errors"]
            return report
        finally:
            state["finished"] = True
            if timer is not None and GLib.MainContext.default().find_source_by_id(timer):
                GLib.source_remove(timer)
            window.destroy()
            self.windows.remove(window)
            save(self.artifacts / "result.json", {"passed": state["report"] is not None and not state["error"] and not state["report"]["errors"],
                                               "completed": self.server.completed, "errors": [state["error"]] if state["error"] else []})

    def __exit__(self, *_):
        for window in self.windows:
            window.destroy()
        self.Gtk.Settings.get_default().set_property("gtk-enable-animations", self.previous_animations)
