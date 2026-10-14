"""Processes and artifacts owned by a single test."""
from contextlib import AbstractContextManager
import json
import os
from pathlib import Path
import queue
import shutil
import signal
import subprocess
import time
import threading

ROOT = Path(__file__).resolve().parents[3]

def save(path, value, indent=2):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=indent) + "\n")
    return path

def require_commands(*names):
    missing = [name for name in names if not shutil.which(str(name))]
    if missing:
        raise RuntimeError("Required test tools are missing: " + ", ".join(map(str, missing)))

def wait_for(check, message, timeout=15, processes=(), interval=0.05):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for process in processes:
            if process.poll() is not None:
                raise RuntimeError(f"{message}: process {process.pid} exited with {process.returncode}")
        value = check()
        if value:
            return value
        time.sleep(interval)
    raise RuntimeError(message)

def read_line(process, timeout=10):
    if not hasattr(process, "startup_lines"):
        process.startup_lines = queue.Queue()
        def read_output():
            try:
                for line in process.stdout:
                    process.startup_lines.put(line)
            finally:
                process.startup_lines.put(None)
        threading.Thread(target=read_output, daemon=True).start()
    try:
        line = process.startup_lines.get(timeout=timeout)
    except queue.Empty as error:
        raise RuntimeError("Process startup timed out") from error
    if line is None:
        raise RuntimeError(f"Process exited before startup output: {process.poll()}")
    return line.rstrip()

def read_rest(process, timeout=10):
    """Wait for exit and return the output read_line's reader collected after startup."""
    process.wait(timeout=timeout)
    deadline = time.monotonic() + timeout
    lines = []
    try:
        while (line := process.startup_lines.get(timeout=max(0.001, deadline - time.monotonic()))) is not None:
            lines.append(line)
    except queue.Empty as error:
        raise RuntimeError("Process output did not close after exit") from error
    return "".join(lines)

def stop(process, timeout=5):
    if process is None:
        return
    if process.poll() is None:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, check=False)
        else:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                process.kill()
            else:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            process.wait(timeout=5)
    for stream in [process.stdout, process.stderr]:
        if stream is not None:
            stream.close()

class ProcessOwner(AbstractContextManager):
    def __init__(self, artifacts, environment=None, root=ROOT):
        self.artifacts = Path(artifacts)
        self.artifacts.mkdir(parents=True, exist_ok=True)
        self.environment = dict(os.environ if environment is None else environment)
        self.root = Path(root)
        self.processes = []
        self.handles = []

    def spawn(self, command, name, **options):
        log = (self.artifacts / (name + ".log")).open("w")
        self.handles.append(log)
        process = subprocess.Popen(
            [str(part) for part in command], cwd=self.root, env=options.pop("env", self.environment),
            stdout=options.pop("stdout", log), stderr=log, start_new_session=os.name != "nt", **options,
        )
        self.processes.append(process)
        return process

    def run(self, command, check=True, timeout=30, environment=None):
        process = subprocess.Popen(
            [str(part) for part in command], cwd=self.root,
            env=self.environment if environment is None else environment,
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=os.name != "nt",
        )
        self.processes.append(process)
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired as error:
            stop(process)
            save(self.artifacts / "failed-command.json", {
                "command": [str(part) for part in command], "timeout": timeout,
                "stdout": (error.stdout or b"").decode(errors="replace"),
                "stderr": (error.stderr or b"").decode(errors="replace"),
            })
            raise
        finally:
            stop(process)
            self.processes.remove(process)
        result = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
        if check and result.returncode:
            save(self.artifacts / "failed-command.json", {
                "command": [str(part) for part in command],
                "stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode,
            })
            raise RuntimeError(f"Command failed: {command}\n{result.stdout}\n{result.stderr}")
        return result

    def __exit__(self, *_):
        for process in reversed(self.processes):
            stop(process)
        for handle in self.handles:
            handle.close()
