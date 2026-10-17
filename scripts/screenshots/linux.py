"""External accessibility navigation and native Linux window capture."""

import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import struct
import subprocess
import sys
import time
import uuid

import gi

gi.require_version("Atspi", "2.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Atspi, Gdk, Gio, GLib


def run(*args):
    return subprocess.run([str(arg) for arg in args], check=True, capture_output=True, text=True, timeout=30).stdout.strip()


def preflight():
    if not (os.environ.get("WAYLAND_DISPLAY") or os.environ.get("DISPLAY")):
        raise RuntimeError("An active Linux desktop session is required")
    Gdk.init([])
    wayland = os.environ.get("XDG_SESSION_TYPE") == "wayland" or bool(os.environ.get("WAYLAND_DISPLAY"))
    tools = ["qdbus6", "spectacle"] if wayland else ["xdotool", "xprop", "magick"]
    for tool in tools:
        if not shutil.which(tool):
            raise RuntimeError(f"Missing screenshot prerequisite: {tool}")
    if wayland:
        run("qdbus6", "org.kde.KWin", "/Scripting")
        help_text = run("spectacle", "--help")
        if "--no-shadow" not in help_text:
            raise RuntimeError("Spectacle must support --no-shadow")
    if Atspi.get_desktop(0) is None:
        raise RuntimeError("AT-SPI accessibility is unavailable")
    return wayland


def descendants(node, depth=0):
    if node is None or depth > 32:
        return
    yield node
    for index in range(node.get_child_count()):
        child = node.get_child_at_index(index)
        if child:
            yield from descendants(child, depth + 1)


class Automation:
    def __init__(self, config, wayland):
        self.config = config
        self.pid = config["pid"]
        self.output = Path(config["outputDir"])
        self.wayland = wayland
        self.reply = None
        self.connection = None
        self.registration = None
        self.scripts = set()
        if wayland:
            self.connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)
            self.bus_name = "org.scrybe.Screenshot.r" + uuid.uuid4().hex
            info = Gio.DBusNodeInfo.new_for_xml('<node><interface name="org.scrybe.Screenshot"><method name="Report"><arg type="s" direction="in"/></method></interface></node>')
            self.registration = self.connection.register_object("/Screenshot", info.interfaces[0], self.report, None, None)
            self.connection.call_sync("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", "RequestName", GLib.Variant("(su)", (self.bus_name, 0)), None, Gio.DBusCallFlags.NONE, 5000, None)

    def report(self, connection, sender, path, interface, method, parameters, invocation):
        self.reply = json.loads(parameters.unpack()[0])
        invocation.return_value(None)

    def wait(self, check, message, timeout=None):
        deadline = time.monotonic() + (timeout or self.config["pageTimeout"])
        while time.monotonic() < deadline:
            try:
                os.kill(self.pid, 0)
                while GLib.MainContext.default().pending():
                    GLib.MainContext.default().iteration(False)
                result = check()
                if result:
                    return result
            except ProcessLookupError:
                raise RuntimeError("Owned Scrybe process exited")
            except GLib.Error:
                pass
            time.sleep(0.1)
        raise RuntimeError(message)

    def app(self):
        desktop = Atspi.get_desktop(0)
        return next((node for node in descendants(desktop, 31) if node.get_process_id() == self.pid), None)

    def nodes(self):
        return list(descendants(self.app()))

    def find(self, names, roles=None):
        for node in self.nodes():
            if node.get_name().strip() in names and (not roles or node.get_role_name() in roles):
                if node.get_state_set().contains(Atspi.StateType.SHOWING):
                    return node

    def activate(self, names, roles=None):
        node = self.wait(lambda: self.find(names, roles), f"Missing accessible control: {names}")
        actions = node.get_action_iface()
        if not actions.get_n_actions() or not actions.do_action(0):
            raise RuntimeError(f"Cannot activate control: {names}")

    def visible_text(self):
        texts = []
        for node in self.nodes():
            if node.get_state_set().contains(Atspi.StateType.SHOWING):
                texts.append(node.get_name().strip())
                try:
                    texts.append(Atspi.Text.get_text(node, 0, -1).strip())
                except GLib.Error:
                    pass
        return texts

    def kwin(self, resize=False, activate=False):
        self.reply = None
        name = "scrybe-screenshot-" + uuid.uuid4().hex
        file = self.output / "kwin.js"
        script_config = {"pid": self.pid, "width": self.config["width"], "height": self.config["height"],
                         "resize": resize, "activate": activate, "busName": self.bus_name}
        file.write_text(Path(__file__).with_name("kwin.js").read_text().replace("__CONFIG__", json.dumps(script_config)))
        self.scripts.add(name)
        try:
            script_id = run("qdbus6", "org.kde.KWin", "/Scripting", "loadScript", file, name)
            run("qdbus6", "org.kde.KWin", f"/Scripting/Script{script_id}", "org.kde.kwin.Script.run")
            result = self.wait(lambda: self.reply, "KWin did not return window geometry", timeout=10)
            if "error" in result:
                raise RuntimeError(result["error"])
            return result
        finally:
            run("qdbus6", "org.kde.KWin", "/Scripting", "unloadScript", name)
            self.scripts.discard(name)

    def x11(self, resize=False, activate=False):
        ids = run("xdotool", "search", "--onlyvisible", "--pid", self.pid).splitlines()
        if len(ids) != 1:
            raise RuntimeError("Expected exactly one owned X11 window")
        self.window_id = ids[0]
        scale = Gdk.Screen.get_default().get_root_window().get_scale_factor()
        width, height = self.config["width"] * scale, self.config["height"] * scale
        if resize or activate:
            run("xdotool", "windowactivate", "--sync", self.window_id)
        if resize:
            run("xdotool", "windowsize", "--sync", self.window_id, width, height)
            run("xdotool", "windowmove", "--sync", self.window_id, 16, 48)
        geometry = dict(line.split("=", 1) for line in run("xdotool", "getwindowgeometry", "--shell", self.window_id).splitlines())
        extents = run("xprop", "-id", self.window_id, "_NET_FRAME_EXTENTS")
        values = re.search(r"=\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)", extents)
        if not values:
            raise RuntimeError("Window manager does not expose _NET_FRAME_EXTENTS")
        left, right, top, bottom = map(int, values.groups())
        x, y, cw, ch = [int(geometry[key]) for key in ("X", "Y", "WIDTH", "HEIGHT")]
        frame = {"x": (x-left)/scale, "y": (y-top)/scale, "width": (cw+left+right)/scale, "height": (ch+top+bottom)/scale}
        screen = Gdk.Screen.get_default()
        if min(frame["x"], frame["y"]) < 0 or (x+cw+right) > screen.get_width()*scale or (y+ch+bottom) > screen.get_height()*scale:
            raise RuntimeError("Requested frame does not fit the X11 desktop")
        return {"frame": frame, "content": {"width": cw/scale, "height": ch/scale}, "scale": scale,
                "active": run("xdotool", "getactivewindow") == self.window_id}

    def geometry(self, resize=False, activate=False):
        return self.kwin(resize, activate) if self.wayland else self.x11(resize, activate)

    def settled(self, page):
        copy = self.config["labels"][self.config["locale"]]
        previous, since = None, time.monotonic()

        def ready():
            nonlocal previous, since
            texts = self.visible_text()
            if texts != previous:
                previous, since = texts, time.monotonic()
            expected = copy["ready"][page]
            return any(expected in text for text in texts) and not any(text in copy["loading"] for text in texts) and time.monotonic() - since >= 1.5

        self.wait(ready, f"Page did not settle: {page}")

    def capture(self):
        print("Waiting for owned Scrybe window and normal model setup…", flush=True)
        self.wait(self.app, "Scrybe did not appear on AT-SPI (startup/model setup may have failed)", self.config["startupTimeout"])
        self.wait(lambda: self.find(["English", "Русский"]), "Language switcher is unavailable; sidebar must be expanded")
        print("Selecting language through the UI…", flush=True)
        self.activate(["English", "Русский"], ["button", "push button", "toggle button", "menu button", "combo box"])
        language = "English" if self.config["locale"] == "en" else "Русский"
        self.activate([f"{self.config['locale'].upper()} {language}", f"{self.config['locale'].upper()}{language}", language], ["menu item", "button", "push button"])
        copy = self.config["labels"][self.config["locale"]]
        self.wait(lambda: self.find([copy["navigation"]["home"]], ["link"]), "Locale change did not complete")
        self.geometry(resize=True)
        results = []
        for page in self.config["pages"]:
            print(f"Capturing {page} ({self.config['locale']})…", flush=True)
            self.activate([copy["navigation"][page]], ["link"])
            self.settled(page)
            dismiss = self.find([copy["dismiss"]], ["button", "push button"])
            if dismiss:
                dismiss.get_action_iface().do_action(0)
            # AT-SPI synthesizes motion through the desktop, without clicking another app.
            if self.wayland:
                if not Atspi.generate_mouse_event(0, 0, "abs"):
                    raise RuntimeError("Desktop denied pointer movement via AT-SPI")
            else:
                run("xdotool", "mousemove", 0, 0)
            self.settled(page)
            def focused():
                geometry = self.geometry(activate=True)
                return geometry if geometry["active"] else None
            geometry = self.wait(focused, "Could not activate the owned Scrybe window")
            if geometry["content"]["width"] != self.config["width"] or geometry["content"]["height"] != self.config["height"]:
                raise RuntimeError(f"Window focus or content dimensions changed: {geometry}")
            if not geometry.get("scale") or geometry["scale"] <= 0:
                raise RuntimeError(f"Native output scale is unavailable: {geometry}")
            path = self.output / f"{page}-{self.config['locale']}-linux.png"
            if self.wayland:
                run("spectacle", "--new-instance", "--background", "--nonotify", "--activewindow", "--no-shadow", "--output", path)
            else:
                run("magick", "import", "-frame", "-window", self.window_id, path)
            if not self.geometry()["active"]:
                raise RuntimeError("Window focus changed during capture")
            pixels = struct.unpack(">II", path.read_bytes()[16:24])
            expected = [math.floor(geometry["frame"][key] * geometry["scale"] + 0.5) for key in ("width", "height")]
            if any(abs(actual - target) > 1 for actual, target in zip(pixels, expected)):
                raise RuntimeError(f"Frame bounds mismatch (shadow or decoration settings?): got {pixels}, expected {expected}")
            results.append({"page": page, "width": self.config["width"], "height": self.config["height"],
                            "pixelWidth": pixels[0], "pixelHeight": pixels[1], "geometry": geometry})
        (self.output / "result.json").write_text(json.dumps(results, indent=2))

    def close(self):
        for name in self.scripts:
            run("qdbus6", "org.kde.KWin", "/Scripting", "unloadScript", name)
        if self.registration:
            self.connection.unregister_object(self.registration)


def main():
    def interrupted(signum, frame):
        raise InterruptedError(f"Interrupted ({signal.Signals(signum).name})")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    automation = None
    try:
        wayland = preflight()
        if sys.argv[1] == "--preflight":
            print("Linux screenshot prerequisites ready")
            return
        config = json.loads(Path(sys.argv[1]).read_text())
        automation = Automation(config, wayland)
        automation.capture()
    except Exception as error:
        if automation:
            try:
                (automation.output / "accessibility.json").write_text(json.dumps([{"name": node.get_name(), "role": node.get_role_name()} for node in automation.nodes()], ensure_ascii=False, indent=2))
            except Exception:
                pass
        print(f"Screenshot failed: {error}", file=sys.stderr)
        raise SystemExit(1)
    finally:
        if automation:
            automation.close()


if __name__ == "__main__":
    main()
