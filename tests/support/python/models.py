"""Explicit model setup; tests never download models."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

REPOSITORY = "ggml-org/whisper-vad"
FILENAME = "ggml-silero-v5.1.2.bin"

def download_vad(destination):
    destination = Path(destination)
    with urllib.request.urlopen(f"https://huggingface.co/api/models/{REPOSITORY}", timeout=30) as response:
        revision = json.load(response)["sha"]
    with urllib.request.urlopen(f"https://huggingface.co/api/models/{REPOSITORY}/tree/{revision}", timeout=30) as response:
        entries = json.load(response)
    entry = next(item for item in entries if item["path"] == FILENAME)
    expected = entry["lfs"]["oid"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://huggingface.co/{REPOSITORY}/resolve/{revision}/{FILENAME}"
    if not destination.is_file():
        temporary = destination.with_suffix(".download")
        try:
            with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            actual = hashlib.sha256(temporary.read_bytes()).hexdigest()
            if actual != expected:
                raise RuntimeError(f"VAD checksum mismatch: expected {expected}, got {actual}")
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    actual = hashlib.sha256(destination.read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(f"Existing VAD checksum mismatch: expected {expected}, got {actual}")
    provenance = {"url": url, "revision": revision, "sha256": actual, "bytes": destination.stat().st_size}
    destination.with_suffix(".provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    return provenance

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    print(json.dumps(download_vad(parser.parse_args().destination), indent=2))
