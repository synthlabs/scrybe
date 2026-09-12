#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../.."
node --test scripts/navigation.test.mjs scripts/audio-devices.test.mjs scripts/settings-editor.test.mjs scripts/overlay-editor.test.mjs scripts/overlay-ws-contract.test.mjs
node scripts/updater-toast.test.mjs
node scripts/home-design.browser.mjs
node scripts/settings-design.browser.mjs
node scripts/overlay-design.browser.mjs
