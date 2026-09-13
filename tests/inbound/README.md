# Scrybe error-flow verification

Run from the Scrybe checkout:

```sh
sh tests/inbound/verify.sh
```

The suite covers the shared controller, Scrybe action copy, updater integration,
Rust capture/submission contracts, both frontend configurations, and the browser
report flow. Browser checks require Chromium (override with
`SCRYBE_TEST_CHROMIUM`) and write screenshots/results to `/tmp/scrybe-inbound-*`.
They mock Tauri commands and report submission; no reports are sent.

Session integration covers phase-specific startup timeout recovery, complete
structured diagnostics, silent cancellation, stale attempt suppression, and
inline model-busy reports. Native startup deadlines and cleanup remain covered
by the local `scripts/verify-session-lifecycle.sh` runner.

The test server permits the resolved dependency directory so a worktree can reuse
an existing `node_modules` symlink. Product server configuration is unchanged.
The optional `regression.sh` also runs the repository's local, ignored Home,
Settings, and Overlay verification scripts when those have been copied into the
worktree.
