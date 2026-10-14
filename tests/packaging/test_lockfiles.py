"""Keep packaging builds from changing dependency resolution."""
from hashlib import sha256
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def unchanged_lockfiles():
    paths = [ROOT / name for name in ("Cargo.lock", "pnpm-lock.yaml", "uv.lock")]
    before = {path: sha256(path.read_bytes()).hexdigest() for path in paths}
    yield
    assert {path: sha256(path.read_bytes()).hexdigest() for path in paths} == before, "Packaging verification changed a dependency lockfile"
