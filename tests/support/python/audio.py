"""Private sound servers and synthetic signals."""
import array
import json
import math
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import wave
from .processes import ProcessOwner, read_line, read_rest, require_commands, save, stop, wait_for

class PrivateAudio(ProcessOwner):
    def __init__(self, artifacts, backend="pipewire", pulse_prefix=None):
        super().__init__(artifacts)
        self.backend = backend
        self.pulse_prefix = pulse_prefix
        self.runtime_directory = tempfile.TemporaryDirectory(prefix="scrybe-audio-")
        self.runtime = Path(self.runtime_directory.name)
        self.environment.update(
            XDG_RUNTIME_DIR=str(self.runtime), PIPEWIRE_RUNTIME_DIR=str(self.runtime),
            XDG_CONFIG_HOME=str(self.artifacts / "config"), XDG_STATE_HOME=str(self.artifacts / "state"),
            PULSE_SERVER=f"unix:{self.runtime}/pulse/native", PIPEWIRE_REMOTE="pipewire-0",
        )
        self.pulse_binary = str(pulse_prefix / "usr/bin/pulseaudio") if pulse_prefix else "pulseaudio"

    def __enter__(self):
        try:
            require_commands("pactl", "pacat", "dbus-daemon", *(
                ["pipewire", "pipewire-pulse", "wireplumber"] if self.backend == "pipewire" else [self.pulse_binary]))
            dbus = self.spawn(["dbus-daemon", "--session", "--nofork", "--print-address"], "dbus", stdout=subprocess.PIPE, text=True)
            self.environment["DBUS_SESSION_BUS_ADDRESS"] = read_line(dbus)
            if self.backend == "pipewire":
                self.spawn(["pipewire"], "pipewire")
                wait_for(lambda: (self.runtime / "pipewire-0").exists(), "Private PipeWire socket missing", processes=self.processes)
                self.spawn(["wireplumber", "--profile", "policy"], "wireplumber")
                self.service = self.spawn(["pipewire-pulse"], "pulse")
            else:
                config = self.artifacts / "pulse.pa"
                config.write_text(f"load-module module-native-protocol-unix socket={self.runtime}/pulse/native\n")
                (self.runtime / "pulse").mkdir()
                command = [self.pulse_binary, "--daemonize=no", "--exit-idle-time=-1", "--use-pid-file=no", "-n", "-F", config]
                if self.pulse_prefix:
                    library = self.pulse_prefix / "usr/lib/pulseaudio"
                    self.environment["LD_LIBRARY_PATH"] = str(library) + ":" + str(library / "modules")
                    command.append(f"--dl-search-path={library / 'modules'}")
                self.service = self.spawn(command, "pulse")
            wait_for(lambda: self.run(["pactl", "info"], check=False).returncode == 0,
                     "Private PulseAudio service unavailable", processes=self.processes)
            self.first_module = self.pactl("load-module", "module-null-sink", "sink_name=first", "sink_properties=device.description=Studio")
            self.pactl("load-module", "module-null-sink", "sink_name=second", "sink_properties=device.description=Second")
            self.pactl("load-module", "module-remap-source", "master=first.monitor", "source_name=mic", "source_properties=device.description=Studio")
            self.pactl("set-default-sink", "first")
            self.pactl("set-default-source", "mic")
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def pactl(self, *arguments):
        return self.run(["pactl", *arguments]).stdout.strip()

    def start_tones(self):
        for sink, frequency in [("first", 440), ("second", 880)]:
            tone = self.artifacts / (sink + ".raw")
            cycle = array.array("h", [int(9000 * math.sin(2 * math.pi * frequency * i / 48000)) for i in range(48000) for _ in range(2)])
            tone.write_bytes(cycle.tobytes() * 45)
            handle = tone.open("rb")
            self.handles.append(handle)
            self.spawn(["pacat", "--playback", "--raw", "--format=s16le", "--rate=48000", "--channels=2",
                        f"--device={sink}", f"--client-name=fixture-{sink}", f"--stream-name=fixture-{sink}",
                        "--latency-msec=20", "--property=node.dont-move=true"], sink, stdin=handle)

    def __exit__(self, *arguments):
        try:
            for kind in ["sinks", "sources", "sink-inputs", "source-outputs"]:
                try:
                    result = self.run(["pactl", "-f", "json", "list", kind], check=False, timeout=5)
                    if result.returncode == 0:
                        (self.artifacts / (kind + ".json")).write_text(result.stdout)
                except (subprocess.SubprocessError, OSError):
                    pass
        finally:
            super().__exit__(*arguments)
            self.runtime_directory.cleanup()

class AudioProbe:
    def __init__(self, server, binary):
        self.server = server
        self.binary = Path(binary)
        if not self.binary.is_file():
            raise RuntimeError(f"Build the audio probe first: cargo build --locked -p scrybe_core --bin audio_probe ({self.binary})")

    def listed(self):
        return json.loads(self.server.run([self.binary, "list"]).stdout)

    def read_ready(self, process):
        line = read_line(process, 7)
        assert line, "Capture exited before ready; inspect probe logs"
        assert json.loads(line)["event"] == "ready", line

    def capture(self, device, seconds=2, name="capture"):
        output = self.server.artifacts / (name + ".wav")
        process = self.server.spawn([self.binary, "capture", "--id", device, "--seconds", seconds, "--output", output],
                                    name, stdout=subprocess.PIPE, text=True)
        self.read_ready(process)
        return process, output

    def finish(self, process):
        stdout = read_rest(process, 8)
        assert process.returncode == 0, f"Capture failed: {stdout}"
        report = json.loads(stdout.strip())
        assert report["sample_rate"] == 16000 and report["channels"] == 1, report
        assert report["frames"] > 8000 and report["rms"] > 0.01, report
        return report

def assert_tone(path, expected, other):
    with wave.open(str(path), "rb") as wav:
        assert wav.getframerate() == 16000 and wav.getnchannels() == 1
        values = array.array("h", wav.readframes(wav.getnframes()))
    values = values[-8000:]
    def power(frequency):
        real = sum(value * math.cos(2 * math.pi * frequency * i / 16000) for i, value in enumerate(values))
        imaginary = sum(value * math.sin(2 * math.pi * frequency * i / 16000) for i, value in enumerate(values))
        return real * real + imaginary * imaginary
    assert power(expected) > 20 * max(power(other), 1), f"Wrong source in {path.name}"

class StalledPulse:
    def __init__(self, timeout=20):
        self.timeout = timeout
        self.directory = tempfile.TemporaryDirectory(prefix="scrybe-stall-")
        self.path = Path(self.directory.name) / "pulse.sock"
        self.release = threading.Event()

    def __enter__(self):
        self.socket = socket.socket(socket.AF_UNIX)
        self.socket.bind(str(self.path))
        self.socket.listen()
        self.socket.settimeout(self.timeout)
        self.error = None
        def accept():
            try:
                with self.socket.accept()[0]:
                    self.release.wait(self.timeout)
            except OSError as error:
                if not self.release.is_set():
                    self.error = error
        self.thread = threading.Thread(target=accept, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.release.set()
        self.socket.close()
        self.thread.join(timeout=self.timeout + 1)
        self.directory.cleanup()
        assert not self.thread.is_alive(), "Stalled audio accept thread did not stop"
