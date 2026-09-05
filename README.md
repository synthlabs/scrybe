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

| Command                        | Description                                                 |
| ------------------------------ | ----------------------------------------------------------- |
| `make dev`                     | Run the desktop app in development mode.                    |
| `make dev-internal`            | Run with the internal frontend and Rust checkout enabled.   |
| `make build`                   | Build the production desktop application.                   |
| `make build-internal`          | Build with the internal frontend and Rust checkout enabled. |
| `make install`                 | Build and install the production desktop application.       |
| `make install-internal`        | Build and install with the internal checkout enabled.       |
| `make check`                   | Run frontend and Rust checks.                               |
| `make test`                    | Run packaging, Node, and Rust test suites.                  |
| `make test-packaging`          | Run packaging integration and installer tests.              |
| `make validate-transcription`  | Validate transcription against the configured local model.  |
| `make validate-hallucinations` | Validate hallucination filtering with configured models.    |

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

### Arch Linux and CachyOS

Scrybe automatically applies its NVIDIA explicit-sync workaround on Linux Wayland
at startup, including development and installed builds. No launch prefix is needed.
Existing `__NV_DISABLE_EXPLICIT_SYNC` values are preserved; setting it to `0` opts
out. The shared helper's detection and safety contract are documented in
[`synth-tauri-runtime`](utils/rust/synth-tauri-runtime/README.md).

Run `bash scripts/verify-linux-startup.sh` for automated checks. On an NVIDIA Wayland
desktop, use `bash scripts/verify-linux-startup.sh --dev` or `--installed` to launch
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

Run `bash scripts/verify-packaging.sh` for app and packaging checks, or
`bash scripts/verify-packaging.sh --arch` to build and verify both package variants
through Podman. The latter installs only inside the container and leaves the internal
package in `package/`; both commands verify that dependency lockfiles stay unchanged.

## Plans

This is still in very early development so it's not really usable as-is. If you're really interested before I finish updating this, you can send me an [email](mailto:scrybe@synth.sh) and I can help you set it up.

Some features planned:

- Multiple audio streams. Meaning you can create independent subtitles for desktop audio and your microphone at the same time.
- Support for Twitch native closed captioning
- OBS plugin to support muting subtitles when you mute your microphone in OBS
- Support subtitle translation
