"""Synthetic app state and private data directories."""
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
from .processes import ROOT, save

def fixture_data(root=ROOT):
    result = subprocess.run(
        ["node", str(Path(root) / "tests/support/browser/fixture-data.ts")],
        cwd=root, check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)

def model_path(value, variable="SCRYBE_TEST_MODEL"):
    if not value:
        raise RuntimeError(f"Set {variable} to an existing local model, or pass the corresponding pytest model option.")
    path = Path(value).expanduser().absolute()
    if not path.is_file():
        raise RuntimeError(f"{variable} is not a file: {path}")
    return str(path)

def native_profile(directory, model=None, state=None, root=ROOT):
    directory = Path(directory)
    initial = deepcopy(state if state is not None else fixture_data(root)["defaults"])
    if model is not None:
        initial["model_path"] = model_path(model)
    initial["sidebar_open"] = True
    store = directory / "data/com.scrybe.live/state.json"
    save(store, {"app_state": initial})
    environment = dict(
        os.environ, XDG_DATA_HOME=str(directory / "data"),
        XDG_CONFIG_HOME=str(directory / "config"), XDG_CACHE_HOME=str(directory / "cache"),
        XDG_STATE_HOME=str(directory / "state"),
        SCRYBE_TEST_SKIP_BINDING_EXPORT="1",
    )
    return initial, store, environment
