# Scrybe-specific extras: whisper.cpp deps + macOS universal-binary setup.
# Sourced by utils/scripts/install_deps.sh after shared checks; has access to
# check_tool, check_apt, ok, miss, warn, info, and the MISSING array.

os=$(uname -s)

if [[ "$os" == "Darwin" ]]; then
    info "scrybe macOS extras"

    if command -v rustup >/dev/null 2>&1; then
        check_tool "rustup target x86_64-apple-darwin" \
            "rustup target list --installed | grep -q '^x86_64-apple-darwin\$'" \
            "rustup target add x86_64-apple-darwin"
    fi

    if [[ ! -f "${ROOT}/.cargo/config.toml" ]] || ! grep -q CMAKE_OSX_DEPLOYMENT_TARGET "${ROOT}/.cargo/config.toml"; then
        miss ".cargo/config.toml CMAKE_OSX_DEPLOYMENT_TARGET" \
            "pull latest — needed to compile whisper.cpp against Xcode 17 SDK"
        MISSING+=(".cargo/config.toml")
    else
        ok ".cargo/config.toml CMAKE_OSX_DEPLOYMENT_TARGET"
    fi
fi

if [[ "$os" == "Linux" ]]; then
    info "scrybe Linux extras"

    check_apt "ALSA" "pkg-config --exists alsa" "librust-alsa-sys-dev"

    if command -v nvcc >/dev/null 2>&1; then
        ok "CUDA toolkit (nvcc)"
    else
        warn "CUDA toolkit (nvcc)" \
            "scrybe_core sets features=[\"cuda\"] on non-macOS — install from https://developer.nvidia.com/cuda-downloads (CI uses Jimver/cuda-toolkit action)"
    fi
fi
