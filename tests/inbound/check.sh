#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/../.."
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --strategy localStorage preferredLanguage baseLocale
node --test utils/js/inbound/controller.test.mjs
pnpm check
