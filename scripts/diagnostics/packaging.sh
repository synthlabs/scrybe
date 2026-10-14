#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd -- "${project_root}"
lockfiles_before="$(sha256sum Cargo.lock pnpm-lock.yaml)"

verify_lockfiles() {
  if [[ "$(sha256sum Cargo.lock pnpm-lock.yaml)" != "${lockfiles_before}" ]]; then
    echo 'Packaging verification changed a dependency lockfile' >&2
    exit 1
  fi
}
trap verify_lockfiles EXIT

case "${1:-}" in
  --arch)
    for target in build build-internal; do
      make "${target}" TAURI_PACKAGING_CONTAINER_RUNTIME="${TAURI_PACKAGING_CONTAINER_RUNTIME:-podman}"
    done
    ;;
  *)
    echo "usage: $0 --arch" >&2
    exit 2
    ;;
esac

echo 'Scrybe packaging verification passed'
