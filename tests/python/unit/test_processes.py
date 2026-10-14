"""Shared process and artifact helpers used by the Linux suites."""
import json
import subprocess
import sys
from tests.support.python.inference import write_golden
from tests.support.python.processes import ROOT, read_line, read_rest

CAPTURE = (
    "import time\n"
    "print('ready', flush=True)\n"
    "time.sleep(0.2)\n"
    "print('captured', flush=True)\n"
)

def test_output_after_startup_is_not_lost():
    # The startup reader keeps the pipe, so a second reader such as communicate() races it.
    for _ in range(5):
        process = subprocess.Popen([sys.executable, "-c", CAPTURE], stdout=subprocess.PIPE, text=True)
        assert read_line(process, 10) == "ready"
        assert read_rest(process, 10) == "captured\n"
        assert process.returncode == 0

def test_golden_refresh_keeps_the_fixture_format(tmp_path):
    fixture = ROOT / "fixtures/transcription/basic_en_short.expected.json"
    expected = fixture.read_text(encoding="utf-8")
    written = write_golden(tmp_path / "golden.json", json.loads(expected))
    assert written.read_text(encoding="utf-8") == expected
