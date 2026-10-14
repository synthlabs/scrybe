"""Explicit inference inputs and repeatable fixture/golden setup."""
import argparse
import array
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import wave
from .processes import ROOT, ProcessOwner, save
from .profiles import model_path

RATE = 16000
DIMA_URL = "https://github.com/user-attachments/files/23571343/dima_clip.wav"
DIMA_SHA256 = "11f67e74f3ced50696c313dcc2d99084f25563866aed8c16ba59139a131ac808"
FIXTURES = ROOT / "target/test-fixtures/inference"

def validate_dima(path):
    if not path.is_file():
        raise RuntimeError("Prepare inference fixtures explicitly: pnpm setup:inference-fixtures --download-public")
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != DIMA_SHA256:
        raise RuntimeError(f"Public fixture checksum mismatch: expected {DIMA_SHA256}, got {actual}")
    return path

def read_samples(path):
    with wave.open(str(path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise RuntimeError(f"{path} must be mono PCM16 for this validation")
        source_rate = wav.getframerate()
        values = array.array("h", wav.readframes(wav.getnframes()))
    import sys
    if sys.byteorder != "little":
        values.byteswap()
    samples = [value / 32767 for value in values]
    if source_rate == RATE:
        return samples
    output_length = math.floor(len(samples) * RATE / source_rate + 0.5)
    result = []
    for index in range(output_length):
        position = index * source_rate / RATE
        left = math.floor(position)
        right = min(left + 1, len(samples) - 1)
        fraction = position - left
        result.append(samples[left] * (1 - fraction) + samples[right] * fraction)
    return result

def write_samples(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = b"".join(struct.pack("<h", math.floor(max(-1, min(1, sample)) * 32767 + 0.5)) for sample in samples)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(data)

def generated_samples():
    random_state = 0x5C12BEEF
    def random():
        nonlocal random_state
        random_state = (1664525 * random_state + 1013904223) & 0xFFFFFFFF
        return random_state / 0x100000000
    def make(seconds, generator):
        return [max(-1, min(1, generator(index))) for index in range(seconds * RATE)]
    cases = {
        "silence": make(5, lambda _: 0),
        "hum_and_room_noise": make(8, lambda index: math.sin(2 * math.pi * 60 * index / RATE) * 0.015 + (random() * 2 - 1) * 0.008),
        "steady_tone": make(5, lambda index: math.sin(2 * math.pi * 440 * index / RATE) * 0.02),
        "click_bursts": make(5, lambda index: 0.12 if index % (RATE / 2) < RATE / 100 else 0),
    }
    ambient = make(5, lambda index: math.sin(2 * math.pi * 60 * index / RATE) * 0.012 + (random() * 2 - 1) * 0.006)
    cases["speech_with_ambient_tail"] = read_samples(ROOT / "fixtures/transcription/basic_en_short.wav") + ambient
    return cases

def setup_fixtures(download_public=False):
    FIXTURES.mkdir(parents=True, exist_ok=True)
    for name, samples in generated_samples().items():
        write_samples(FIXTURES / (name + ".wav"), samples)
    destination = FIXTURES / "dima_clip.wav"
    if download_public and not destination.is_file():
        result = subprocess.run(["gh", "api", DIMA_URL], check=True, capture_output=True)
        if hashlib.sha256(result.stdout).hexdigest() != DIMA_SHA256:
            raise RuntimeError("Downloaded public fixture checksum mismatch")
        destination.write_bytes(result.stdout)
    if destination.is_file():
        validate_dima(destination)
    save(FIXTURES / "manifest.json", {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(FIXTURES.glob("*.wav"))})

def fixture_path(name):
    path = FIXTURES / (name + ".wav")
    if not path.is_file():
        raise RuntimeError("Prepare inference fixtures explicitly: pnpm setup:inference-fixtures")
    return validate_dima(path) if name == "dima_clip" else path

def use_gpu():
    return os.environ.get("SCRYBE_TEST_GPU", "").lower() in ["1", "true"]

def features():
    explicit = os.environ.get("SCRYBE_TEST_FEATURES")
    if explicit:
        return explicit
    if use_gpu() and os.name == "nt":
        return "whisper-runtime,cuda"
    import sys
    if use_gpu() and sys.platform == "darwin":
        return "whisper-runtime,coreml,metal"
    return "whisper-runtime"

def transcribe(artifacts, model, audio, extra=()):
    output = Path(artifacts) / "actual.json"
    command = ["cargo", "run", "--locked", "-p", "scrybe_core", "--bin", "transcribe_fixture",
               "--features", features(), "--", "--model", model, "--audio", audio, "--output", output, *extra]
    with ProcessOwner(artifacts) as owner:
        result = owner.run(command, timeout=600)
        (owner.artifacts / "inference.log").write_text(result.stdout + result.stderr)
    return json.loads(output.read_text())

def write_golden(path, actual):
    return save(path, {
        "params": actual["params"], "normalized_text": actual["normalized_text"],
        "max_word_error_rate": 0.35, "min_segments": 1, "max_segments": None,
    }, indent=4)

def update_golden(model):
    model = model_path(model)
    directory = ROOT / "target/test-results/golden-setup"
    directory.mkdir(parents=True, exist_ok=True)
    actual = transcribe(directory, model, ROOT / "fixtures/transcription/basic_en_short.wav")
    write_golden(ROOT / "fixtures/transcription/basic_en_short.expected.json", actual)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-public", action="store_true")
    parser.add_argument("--update-goldens", action="store_true")
    parser.add_argument("--model", default=os.environ.get("SCRYBE_TEST_MODEL"))
    options = parser.parse_args()
    setup_fixtures(options.download_public)
    if options.update_goldens:
        update_golden(options.model)
