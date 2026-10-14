<p align="center">
  <a href="https://github.com/synthlabs/scrybe"><img src="screenshots/scrybe_v1_sparkles.png" height="180"></a>
</p>

<span align="center">

# Local Subtitles for your own Broadcasts

Currently most programs available to add subtitles to your own broadcasts require sending your audio to a third-party service. This is a basic attempt at a fully local, livestream-native subtitling program.

<p align="center">
  <img src="screenshots/scrybe_0j1h8WKu9n.png" height="500">
</p>

</span>

## Development setup

1. **Initialize submodules.** Run `git submodule update --init --recursive` unless you cloned with `--recurse-submodules`.
2. **Check dependencies.** Run `./utils/scripts/install_deps.sh` (macOS/Linux) or `./utils/scripts/install_deps.ps1` (Windows) to verify every tool the build needs; missing tools are printed with install hints. Pass `--ci` / `-CI` to install them automatically.
3. **Build & run.** `pnpm install && pnpm tauri dev`.

### Make shortcuts

With GNU Make and `toke` available on `PATH`, these optional shortcuts cover common workflows:

| Command                 | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `make dev`              | Run the desktop app in development mode.                                  |
| `make dev-internal`     | Run with the internal frontend and Rust checkout enabled.                 |
| `make build`            | Build the production desktop application.                                 |
| `make build-internal`   | Build with the internal frontend and Rust checkout enabled.               |
| `make install`          | Build and install the production desktop application.                     |
| `make install-internal` | Build and install with the internal checkout enabled.                     |
| `make check`            | Run frontend and Rust checks.                                             |
| `make test`             | Run the sequential portable test suites.                                  |
| `make verify`           | Check/build the frontend, run tests, and check Rust formatting and diffs. |
| `make test-packaging`   | Run packaging integration and installer tests.                            |
| `make test-inference`   | Run inference checks with explicit local model inputs.                    |

Use `pnpm test` and `pnpm verify` directly without Make or `toke`.
See [the test guide](tests/README.md) for setup, focused commands, and specialized suites.

Builds produce an NSIS installer on Windows, a DEB on Debian-family Linux, and an
x86_64 pacman package on Arch-family Linux. Other platforms retain Tauri's normal
bundle behavior. Install targets currently support Windows, Debian-family Linux,
and x86_64 Arch-family Linux; macOS, RPM, and AppImage installation are not supported.

Installation builds first and selects exactly one fresh artifact. Linux installation
uses `sudo` with noninteractive apt-get or pacman; Windows displays the installer's
normal UI and waits for it to finish. Standard and internal builds use the same
application identity, installation, and settings; installing either replaces the other.

To install an existing artifact without rebuilding or requiring an internal checkout:

```bash
make install-internal TAURI_PACKAGING_INSTALL_ARTIFACT=/path/to/scrybe-0.2.16-1-x86_64.pkg.tar.zst
```

Use a `.deb` artifact on Debian-family hosts or an NSIS `.exe` on Windows. Tauri
bundles are under `target/release/bundle/`; Arch packages are under `package/`.

### Audio sources on Linux

Scrybe requires PulseAudio or PipeWire with its PulseAudio compatibility service
(`pipewire-pulse`). Settings lists **Microphones & Inputs** and **Computer Audio**;
computer audio captures sound playing through the selected output. Choose one
source at a time. Each group has a system default that resolves when you press
Start and stays on that device until you stop. Available devices refresh while
Settings is visible. If a source disconnects, capture stops and explains the error.

Saved ALSA selections from older versions require choosing a source again. The
empty/default selection continues to use the system input. macOS retains its
existing device menu and capture backend.

Linux development needs the libpulse headers (`libpulse-dev` on Debian/Ubuntu,
`libpulse` on Arch). Packaged builds declare the client-library dependency; the
desktop's audio service must already be running.

Build `cargo build --locked -p scrybe_core --bin audio_probe`, then run
`pnpm test:audio --audio-backend pipewire` or
`pnpm test:audio --audio-backend pulseaudio` for repeatable checks.
These require the named server binaries, `pactl`, `pacat`, and `dbus-daemon`.
They start private servers and use synthetic audio without changing desktop
routing. Logs and measurements are saved under `target/test-results/`.
The tests cover routing, defaults, device removal, server shutdown, startup
cancellation, and resource cleanup.

For a desktop acceptance check, build `cargo build -p scrybe_core --bin audio_probe`,
then run `target/debug/audio_probe list` and compare the names with sound settings.
`python3 scripts/diagnostics/audio.py` compares the catalog with
the running audio server automatically.
With a known signal playing or a microphone in use, run
`target/debug/audio_probe capture --id '<device ID>' --seconds 3` to check capture
statistics. Audio is only saved if you supply `--output /path/to/recording.wav`.

### Arch Linux and CachyOS

Scrybe automatically applies its NVIDIA explicit-sync workaround on Linux Wayland
at startup, including development and installed builds. No launch prefix is needed.
Existing `__NV_DISABLE_EXPLICIT_SYNC` values are preserved; setting it to `0` opts
out. The shared helper's detection and safety contract are documented in
[`synth-tauri-runtime`](utils/rust/synth-tauri-runtime/README.md).

Run `pnpm verify` for automated checks. On an NVIDIA Wayland
desktop, use `bash scripts/diagnostics/linux-startup.sh --dev` or `--installed` to launch
with the override unset, then confirm a responsive window and the workaround log.
Use `--desktop` to launch the installed desktop entry with the override unset.
Also verify a normal launch from the desktop menu after installing the new build.

Local packaging requires an x86_64 host with GNU Make, Cargo, Node.js, Docker or
Podman, and `sudo`/`pacman` for installation. Initialize the `utils` submodule first.
Build dependencies and the pinned pnpm version are installed inside an Arch Linux
container; the host dependency script's apt-based Linux installer is not needed for
this workflow. Docker is selected when available, otherwise Podman. To select Podman
explicitly:

```bash
make build TAURI_PACKAGING_CONTAINER_RUNTIME=podman
make install-internal TAURI_PACKAGING_CONTAINER_RUNTIME=podman
```

Internal builds also require the internal frontend and Rust checkout. The build
validates the package, installs it inside the container, and checks that it launches
before host installation. These packages currently use CPU transcription; GPU
packaging is a follow-up.

To update, update your source checkout and submodules, then rerun `make install` or
`make install-internal` with the same container-runtime override if needed. The Arch
app's **Update via package manager** action opens these instructions. Other builds
retain in-app updates. AUR publishing is planned separately.

Run `pnpm verify` for app and packaging checks, or
`bash scripts/diagnostics/packaging.sh --arch` to build and verify both package variants
through Podman. The latter installs only inside the container and leaves the internal
package in `package/`; both commands verify that dependency lockfiles stay unchanged.

## Plans

This is still in very early development so it's not really usable as-is. If you're really interested before I finish updating this, you can send me an [email](mailto:scrybe@synth.sh) and I can help you set it up.

Some features planned:

- Multiple audio streams. Meaning you can create independent subtitles for desktop audio and your microphone at the same time.
- Support for Twitch native closed captioning
- OBS plugin to support muting subtitles when you mute your microphone in OBS
- Support subtitle translation
