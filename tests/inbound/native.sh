#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../.."
cargo test -p inbound --lib --offline
TAURI_ENV_PLATFORM=linux cargo test -p scrybe --lib --offline
