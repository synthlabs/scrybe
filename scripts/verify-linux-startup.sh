#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "${project_root}"

case "${1:-}" in
  '')
    cargo test --locked -p synth-tauri-runtime
    make check
    cargo test --locked -p scrybe
    git diff --check
    git -C utils diff --check
    echo 'Scrybe startup checks passed'
    ;;
  --dev|--installed|--desktop)
    if [[ "$(uname -s)" != Linux || ! -v WAYLAND_DISPLAY || ! -e /proc/driver/nvidia/version ]]; then
      echo 'Live acceptance requires Linux, WAYLAND_DISPLAY, and the NVIDIA driver.' >&2
      exit 1
    fi
    if pgrep -x scrybe >/dev/null; then
      echo 'Close the running Scrybe instance before testing startup.' >&2
      exit 1
    fi
    echo 'Expect the NVIDIA workaround log and a responsive window; close it after checking.'
    if [[ "$1" == --dev ]]; then
      exec env -u __NV_DISABLE_EXPLICIT_SYNC make dev
    fi
    if [[ "$1" == --desktop ]]; then
      exec env -u __NV_DISABLE_EXPLICIT_SYNC gtk-launch scrybe
    fi
    exec env -u __NV_DISABLE_EXPLICIT_SYNC /usr/bin/scrybe
    ;;
  *)
    echo "usage: $0 [--dev|--installed|--desktop]" >&2
    exit 2
    ;;
esac
