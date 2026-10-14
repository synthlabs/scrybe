#!/usr/bin/env python3
"""Compare the desktop audio catalog; capture only explicitly requested IDs."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--audio-probe", type=Path, default=ROOT / "target/debug/audio_probe")
parser.add_argument("--capture-id", action="append", default=[], help="Capture three seconds without saving audio (repeatable)")
args = parser.parse_args()

def desktop_run(command):
    return subprocess.check_output(command, text=True, timeout=10)

devices = json.loads(desktop_run([str(args.audio_probe), "list"]))
sources = json.loads(desktop_run(["pactl", "-f", "json", "list", "sources"]))
sinks = json.loads(desktop_run(["pactl", "-f", "json", "list", "sinks"]))
expected = {f"pulse:source:{s['name']}": (s["description"], "input") for s in sources if not s["monitor_source"]}
expected.update({f"pulse:sink:{s['name']}": (s["description"], "output") for s in sinks})
actual = {d["id"]: (d["name"], d["kind"]) for d in devices if not d["is_default"]}
assert actual == expected, (actual, expected)
print(json.dumps(devices, indent=2), flush=True)
for device in args.capture_id:
    result = desktop_run([str(args.audio_probe), "capture", "--id", device, "--seconds", "3"])
    report = json.loads(result.splitlines()[-1])
    assert report["frames"] > 0 and report["sample_rate"] == 16000 and report["channels"] == 1, report
    print(json.dumps({"device": device, **report}), flush=True)
print("PASS desktop catalog matches sound-server endpoints; requested captures delivered mono 16 kHz frames", flush=True)
