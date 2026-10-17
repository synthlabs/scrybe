# Scrybe tests

`pnpm test` runs the portable suites sequentially: app unit, shared JavaScript,
screenshot tooling, portable Python and update-mode builds, selected Rust packages, mocked packaging,
Chromium, then the internal hook. A failure stops the sequence.

`pnpm verify` runs frontend checks/build, `pnpm test`, full workspace Rust formatting,
and root/shared diff checks. `make test` and `make verify` delegate to these commands.
The pull-request/main CI matrix runs the `pnpm verify` steps on Linux, macOS, and
Windows with Node 24 and Python 3.13. Chromium runs only on Linux, mocked packaging
skips macOS, and Windows builds the Rust tests (including the internal hook's)
without running them. Release publishing remains separate.

Shared `utils` tests remain in place.

## Setup

Portable CI targets Node 24 LTS and Python 3.13. Use the pnpm version declared in
`package.json`, uv, and the Rust toolchain and platform build prerequisites needed
by the app.

```sh
pnpm install --frozen-lockfile
uv sync --locked --group test --python 3.13
pnpm exec playwright install chromium
```

The Python project is a test environment, not an installable package. Pytest is
locked in `uv.lock`; Vitest and Playwright are locked in `pnpm-lock.yaml`.
Linux browser hosts also need Playwright's documented operating system dependencies.

Linux desktop suites use a separate environment with the system Python and its GI
bindings. Install GTK 3, WebKitGTK 4.1, AT-SPI 2, and their Python GI bindings first:

```sh
uv venv --python /usr/bin/python3 --system-site-packages .venv-native
UV_PROJECT_ENVIRONMENT=.venv-native uv sync --locked --group test --python /usr/bin/python3
```

The desktop commands disable automatic pytest plugin loading so unrelated system
Python plugins do not join the locked test environment.

## Focused commands

| Command                         | Coverage                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm test:unit`                | 72 app cases in 12 Vitest files                                                                   |
| `pnpm test:shared`              | 10 existing shared Inbound controller cases                                                       |
| `pnpm test:screenshots`         | 19 portable native-capture orchestration and README image update cases                            |
| `pnpm test:python`              | Three portable probe startup failure cases and two update-install build modes                     |
| `pnpm test:rust`                | All tests in `scrybe_core`, `scrybe`, `synth-tauri-runtime`, and `inbound`                        |
| `pnpm test:browser`             | 39 Chromium cases with mocked Tauri commands and motion probes                                    |
| `pnpm test:internal`            | Common internal-enabled frontend/Rust checks, app Rust tests, and applicable implementation tests |
| `pnpm test:packaging`           | Mocked shell packaging on Linux/macOS or shared mocked PowerShell install tests on Windows        |
| `pnpm test:webkit`              | 18 Linux WebKitGTK button, disclosure, scroll, trace, and model chooser cases                     |
| `pnpm test:native`              | 12 Linux Tauri startup, Overlay, Settings, session, and motion cases                              |
| `pnpm test:audio`               | 15 private Linux audio cases, including 21 lifecycle cycles                                       |
| `pnpm test:inference`           | Nine explicit local-model transcription, cancellation, and hallucination cases                    |
| `pnpm test:packaging:artifacts` | Built Windows CUDA imports, staged DLL dependencies, licenses, and NSIS hooks                     |

Make aliases use the same names with colons replaced by hyphens. Unit and browser
files run serially without retries. Vitest saves
`target/test-results/vitest.json`; pytest saves `target/test-results/python.xml`.
Cargo requires the app's native build dependencies and may build the frontend.
The model-dependent inference cancellation case remains explicitly ignored in
the portable Cargo run.

Focused reruns accept runner arguments:

```sh
pnpm test:unit tests/unit/inbound/error-flows.test.ts
pnpm test:python -k foreign
pnpm test:browser input-lock.spec.ts
pnpm test:browser --grep "Buttons"
```

The portable Python tests exercise the extracted probe server's pre-window failure
paths with test-owned temporary directories and server/process cleanup. These cases
do not launch WebKit.

The Stage 2 Linux audit preserves all 155 legacy assertion expressions and 31
parameter loops across the app JavaScript inputs. The legacy Node total was 79
including 10 shared cases and one file result for the updater's four top-level
checks; Vitest registers those four checks individually. Shared `utils` sources
and tests remain unchanged. macOS, Windows, and Node 24 execution require the new CI matrix; they have not
been executed on this Linux/Node 26 host.

Stage 3 passes all 39 Chromium cases on Linux. Its audit preserves 278 browser
assertion expressions, 41 shared probe checks, 17 motion reproduction error
checks, and 44 parameter loops. Both binding files retain their pre-migration contents. The reproduction probe also runs in WebKit and the real native app in Stage 4.

The Chromium runner owns a fresh context for each case and a Vite server bound to
an ephemeral local port. It disables file watching during tests. Mocked Tauri
commands use synthetic data; the browser suite does not require a native app,
audio devices, model files, or an account. Locale, viewport, font size, and reduced
motion combinations register as individual Playwright cases and run serially
without retries.

Playwright saves its JSON report to `target/test-results/playwright.json` and
measurement JSON under `target/test-results/browser/`. Screenshots and traces are
retained only for failures. The migrated button, disclosure, and motion
reproduction probes are TypeScript modules under `tests/support/browser/`.
The specialized WebKit loader loads them through a test-owned Vite server.

## Internal hook

`pnpm test:internal` calls `node internal/internal-test.mjs` from the app root.
Both internal branches provide the same entry point. It runs serially, forces
`ENABLE_INTERNAL=1` in child processes, streams output, and propagates failures.
The public starter runs its contract tests and the app's Rust library tests;
private `main` also runs its existing implementation tests with local HTTP mocks.
It never calls the host aggregate test or verify commands. The private crate is
copied outside the host Cargo workspace and cleaned up after success or failure;
its tests use its own committed lockfile. The current checkout's binding edits
remain untouched. `sh internal/verify.sh` retains public checks before this hook.

Internal publication needs separate commits in the prepared starter/main worktrees
before the production starter synchronization tests can validate the new committed
export. The synchronization script requires a clean committed source; verification
does not bypass that requirement. No commit or push is performed by the test hook.

## Specialized suites

WebKit requires an active Linux desktop session. Native tests also require AT-SPI
accessibility, `pgrep`, KDE KWin's `qdbus6` scripting interface for close-window
checks, and a debug test binary. Close any running Scrybe instance first. Native
tests rebuild the default `target/debug/scrybe` with `session-test-hooks` first.

```sh
cargo build --locked -p scrybe_core --bin audio_probe
pnpm test:webkit
pnpm test:native --model /absolute/path/to/whisper-model.bin
pnpm test:audio
```

Audio tests require `dbus-daemon`, `pactl`, `pacat`, `pipewire`, `pipewire-pulse`,
and `wireplumber`. They own private servers and synthetic 440/880 Hz signals.
`--audio-backend pulseaudio` selects a private PulseAudio server instead;
`--pulse-prefix /path/to/extracted/package` selects its binary and libraries and
defaults to `SCRYBE_TEST_PULSE_PREFIX`. Run that pass with
`pnpm test:audio --audio-backend pulseaudio`.
The explicit desktop diagnostic is `python3 scripts/diagnostics/audio.py`.
Only a supplied `--capture-id` requests a three-second desktop capture; it saves
no audio recording.

Native tests create a fresh synthetic state file and private XDG directories for
every run. They require an explicit Whisper model and never read the desktop app's
state. Their environment sets `SCRYBE_TEST_SKIP_BINDING_EXPORT=1`; suppression
requires both a debug build and `session-test-hooks`. Normal debug binding exports
remain enabled. Both public and internal export calls use this guard.

Inference fixtures and model downloads are explicit setup operations:

```sh
pnpm setup:inference-fixtures --download-public
pnpm setup:vad target/test-models/ggml-silero-v5.1.2.bin
pnpm test:inference --model /absolute/path/to/whisper-model.bin --vad-model target/test-models/ggml-silero-v5.1.2.bin
```

Fixture setup preserves the authored seeded waveforms and validates the public
audio fixture's SHA-256. VAD setup resolves an official repository revision and
records its download URL, revision, SHA-256, and size next to the model. Tests never
download inputs or update goldens. An intentional golden refresh uses
`pnpm setup:inference-fixtures --update-goldens --model /absolute/path/to/whisper-model.bin`.
Model options also accept `SCRYBE_TEST_MODEL` and `SCRYBE_TEST_VAD_MODEL`.
Hallucination cases retain the authored `SCRYBE_TEST_GPU`/`SCRYBE_TEST_FEATURES`
options for an explicitly selected accelerated build.

Python reports are `target/test-results/{python,webkit,native,audio,inference}.xml`.
Each pytest case records a fresh artifact directory in its JUnit properties;
logs, accessibility snapshots, and measurement JSON live there. Successful runs
retain no screenshots. WebKit motion reruns accept `--motion-repetitions`,
`--motion-width`, `--motion-height`, `--motion-font`, `--motion-locale`, and
`--motion-reduced`; native motion keeps the authored 1300×900/default font
matrix and also accepts `--motion-locale`. `--probe-root`, `--probe-port`, `--probe-timeout`, and
`--preview-source` make worktree and preview probes explicit. A foreign server or
incomplete startup cannot produce a passing result.
For another native worktree, also supply its built `--native-binary`; native
servers use that worktree's configured Tauri development URL.

Built artifact checks require Windows, PowerShell, a CUDA-enabled Scrybe executable,
staged CUDA DLLs, and generated NSIS hooks. They remain separate from mocked
packaging and have not been executed on this Linux host:

```sh
pnpm test:packaging:artifacts --binary target/release/scrybe.exe --staged-dir target/windows-cuda-redist/resources/cuda --hook target/windows-cuda-redist/cuda-redist-hooks.nsh
```

## Operations and explicit generation

### Native README screenshot tooling

`pnpm test:screenshots` (or `make test-screenshots`) runs portable Node tests for
PNG integrity, argument validation, literal spaced paths, isolated profile paths,
process failures/timeouts/interruption, occupied ports, and transactional README
updates. The update cases use temporary directories and cover legacy/stable image
archives, archive-name collisions, idempotence, rejected input, concurrent updates,
and rollback after each mutation. This suite is included in `pnpm test`.

`make screenshot-smoke` is an explicit desktop acceptance script, separate from
portable tests. It builds the public release app with a unique application identity
for each run and navigates using external accessibility APIs. It captures all four
pages in EN/RU at 1300×900 and 1000×650 logical content pixels, verifies content and
native frame dimensions, and checks that the README, screenshot files, and binding
files are unchanged. It also compares content hashes of the normal Scrybe profile
directories before and after capture. It saves `smoke.json` alongside the generated PNGs and logs.
The regular application profile is never loaded; temporary profiles are removed.
Model downloads use the app's normal cache and startup behavior.

Run that script on Linux KDE Wayland, Linux X11, macOS, and Windows 10 1903+ before
declaring support verified. Repeat at the display scales being supported. Review
each PNG for the correct selected page and locale, blank Home state, expanded
sidebar, complete title bar, tight bounds, and absence of shadows, pointer, menus,
loading states, or update notifications. Smaller displays must use dimensions that
fit their work area for individual captures; the full smoke matrix needs room for
the default window.

Failure acceptance: deny/revoke accessibility or screen-capture permission, hide a
required screenshot command from PATH, occupy port 3030 with another app, and
interrupt a capture with Ctrl+C. Each run must fail clearly, retain logs, stop only
its own process tree, and remove its temporary profile. A model-download/startup
failure must not produce a successful capture. No platform can be marked verified
from portable tests or source inspection alone.

### Existing diagnostics

Maintained build hooks live in `scripts/build/`; Tauri Windows configuration points
to them. Diagnostics remain explicit:

```sh
bash scripts/diagnostics/linux-startup.sh --dev
bash scripts/diagnostics/packaging.sh --arch
.venv-native/bin/python scripts/diagnostics/reduced-motion.py
node scripts/diagnostics/motion-report.mjs /path/to/case-artifacts --summary
```

The reduced-motion diagnostic retains the served PreviewFrame override experiment
and runs the WebKit overlay cases through pytest. It does not edit tracked sources.
The packaging diagnostic builds both Arch variants and checks lockfile invariance;
it requires the documented container toolchain. These operations are outside the
portable aggregate.

Binding regeneration is an intentional development operation, never part of tests:

```sh
cargo run -p scrybe --features gen_bindings --example gen_bindings
pnpm exec prettier --write src/lib/bindings.ts
```

Inbound coverage lives in `tests/unit/inbound/`, `tests/browser/inbound/`, the shared
controller tests, and the selected Rust packages. It retains EN/RU recovery,
structured startup diagnostics, cancellation/stale attempts, model-busy reporting,
and updater callbacks. Reports use mocks; no report is sent. Playwright owns the
server and browser, and permits resolved dependency paths for worktree symlinks.

Runner setup can be checked with `pnpm exec vitest --version`,
`pnpm exec playwright --version`, and `uv run --locked pytest --version`.
No suite retries failures or requires manual screenshot acceptance. Layout,
contrast, interaction, and motion assertions remain; successful runs retain no images.
