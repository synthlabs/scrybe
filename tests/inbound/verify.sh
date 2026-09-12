#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../.."
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --strategy localStorage preferredLanguage baseLocale
node --test utils/js/inbound/controller.test.mjs tests/inbound/*.test.mjs
pnpm check
ENABLE_INTERNAL=1 pnpm check
pnpm build
cargo test -p inbound --lib
cargo test -p scrybe --lib
node tests/inbound/browser.mjs
git diff --check
git -C utils diff --check
