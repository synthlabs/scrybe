"""Retain both frontend update-install builds from verify-packaging.sh."""
import os
import shutil
import subprocess
import pytest
from .test_lockfiles import ROOT, unchanged_lockfiles


@pytest.mark.parametrize("mode", ["in-app", "package-manager"])
def test_update_install_build(mode):
    pnpm = shutil.which("pnpm")
    assert pnpm, "pnpm is required"
    subprocess.run([pnpm, "build"], cwd=ROOT,
                   env={**os.environ, "PUBLIC_UPDATE_INSTALL_MODE": mode}, check=True)
