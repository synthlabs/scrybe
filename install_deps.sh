#!/usr/bin/env bash
# install_deps.sh — check (default) or install (--ci) scrybe's system dependencies
# on macOS and Linux. Mirrors install_deps.ps1 for Windows.

set -euo pipefail

MODE=verify
if [[ "${1:-}" == "--ci" ]]; then
    MODE=install
elif [[ -n "${1:-}" ]]; then
    echo "usage: $0 [--ci]" >&2
    exit 2
fi

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
    C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
    C_RED=''; C_GREEN=''; C_YELLOW=''; C_BOLD=''; C_DIM=''; C_RESET=''
fi

ok()   { printf "  ${C_GREEN}✓${C_RESET} %s\n" "$1"; }
miss() { printf "  ${C_RED}✗${C_RESET} %s ${C_DIM}— %s${C_RESET}\n" "$1" "$2"; }
warn() { printf "  ${C_YELLOW}!${C_RESET} %s ${C_DIM}— %s${C_RESET}\n" "$1" "$2"; }
info() { printf "${C_BOLD}==>${C_RESET} %s\n" "$1"; }

MISSING=()
APT_PKGS=()
APT_TRACKED=()  # "name<TAB>check-cmd" entries for post-install re-verification

# check_tool <name> <check-cmd> <install-hint>
# Runs <check-cmd>. In install mode, executes <install-hint> on failure and re-checks.
check_tool() {
    local name="$1" check_cmd="$2" hint="$3"
    if eval "$check_cmd" >/dev/null 2>&1; then
        ok "$name"
        return 0
    fi
    if [[ "$MODE" == "install" ]]; then
        info "installing: $name"
        if eval "$hint" && eval "$check_cmd" >/dev/null 2>&1; then
            ok "$name (installed)"
            return 0
        fi
        miss "$name" "install failed"
    else
        miss "$name" "$hint"
    fi
    MISSING+=("$name")
}

# check_apt <name> <check-cmd> <apt-pkg>
# Linux-only. In install mode queues the package for a single batched apt-get call.
check_apt() {
    local name="$1" check_cmd="$2" pkg="$3"
    if eval "$check_cmd" >/dev/null 2>&1; then
        ok "$name"
        return 0
    fi
    if [[ "$MODE" == "install" ]]; then
        APT_PKGS+=("$pkg")
        APT_TRACKED+=("$name"$'\t'"$check_cmd")
        warn "$name" "queued for apt: $pkg"
    else
        miss "$name" "sudo apt-get install -y $pkg"
        MISSING+=("$name")
    fi
}

pnpm_pinned_version() {
    # parse "packageManager": "pnpm@X.Y.Z" from package.json without jq
    sed -nE 's/.*"packageManager"[[:space:]]*:[[:space:]]*"pnpm@([0-9.]+)".*/\1/p' package.json
}

check_macos() {
    info "macOS dependencies"

    check_tool "Xcode Command Line Tools" \
        "xcode-select -p" \
        "xcode-select --install  # opens a GUI dialog"

    check_tool "Homebrew" \
        "command -v brew" \
        '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'

    check_tool "cmake" \
        "command -v cmake" \
        "brew install cmake"

    check_tool "rustup" \
        "command -v rustup" \
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"

    if command -v rustup >/dev/null 2>&1; then
        check_tool "rustup target x86_64-apple-darwin" \
            "rustup target list --installed | grep -q '^x86_64-apple-darwin$'" \
            "rustup target add x86_64-apple-darwin"
    fi

    if [[ ! -f .cargo/config.toml ]] || ! grep -q CMAKE_OSX_DEPLOYMENT_TARGET .cargo/config.toml; then
        miss ".cargo/config.toml CMAKE_OSX_DEPLOYMENT_TARGET" \
            "pull latest — needed to compile whisper.cpp against Xcode 17 SDK"
        MISSING+=(".cargo/config.toml")
    else
        ok ".cargo/config.toml CMAKE_OSX_DEPLOYMENT_TARGET"
    fi
}

check_linux() {
    info "Linux (Debian/Ubuntu) dependencies"

    check_apt "C/C++ toolchain"     "command -v cc && command -v c++"        "build-essential"
    check_apt "cmake"               "command -v cmake"                       "cmake"
    check_apt "pkg-config"          "command -v pkg-config"                  "pkg-config"
    check_apt "webkit2gtk-4.1"      "pkg-config --exists webkit2gtk-4.1"     "libwebkit2gtk-4.1-dev"
    check_apt "appindicator3"       "pkg-config --exists appindicator3-0.1"  "libappindicator3-dev"
    check_apt "librsvg"             "pkg-config --exists librsvg-2.0"        "librsvg2-dev"
    check_apt "patchelf"            "command -v patchelf"                    "patchelf"
    check_apt "ALSA"                "pkg-config --exists alsa"               "librust-alsa-sys-dev"
    check_apt "xdg-utils"           "command -v xdg-open"                    "xdg-utils"

    if command -v nvcc >/dev/null 2>&1; then
        ok "CUDA toolkit (nvcc)"
    else
        warn "CUDA toolkit (nvcc)" \
            "scrybe_core sets features=[\"cuda\"] on non-macOS — install from https://developer.nvidia.com/cuda-downloads (CI uses Jimver/cuda-toolkit action)"
    fi
}

check_shared() {
    info "shared dependencies"

    check_tool "Node.js" \
        "command -v node" \
        "install Node (brew install node / apt install nodejs / nvm)"

    local pinned
    pinned=$(pnpm_pinned_version || true)
    check_tool "pnpm${pinned:+ $pinned}" \
        "command -v pnpm" \
        "corepack enable && corepack prepare pnpm@${pinned:-latest} --activate"
}

apply_apt_batch() {
    [[ ${#APT_PKGS[@]} -eq 0 ]] && return 0
    info "sudo apt-get install -y ${APT_PKGS[*]}"
    sudo apt-get update
    sudo apt-get install -y "${APT_PKGS[@]}"

    # Re-verify each queued check: move still-failing ones into MISSING.
    local entry name check
    for entry in "${APT_TRACKED[@]}"; do
        name="${entry%%$'\t'*}"
        check="${entry#*$'\t'}"
        if eval "$check" >/dev/null 2>&1; then
            ok "$name (installed)"
        else
            miss "$name" "apt install did not resolve — check package name"
            MISSING+=("$name")
        fi
    done
}

init_submodules() {
    if [[ -f .gitmodules ]]; then
        info "git submodule update --init --recursive"
        git submodule update --init --recursive
    fi
}

main() {
    local os
    os=$(uname -s)
    info "mode: $MODE"
    info "os:   $os"
    case "$os" in
        Darwin) check_macos ;;
        Linux)  check_linux ;;
        *)
            echo "unsupported OS: $os — use install_deps.ps1 on Windows" >&2
            exit 2
            ;;
    esac

    check_shared

    [[ "$os" == "Linux" ]] && apply_apt_batch

    init_submodules

    echo
    if [[ ${#MISSING[@]} -eq 0 ]]; then
        printf "${C_GREEN}${C_BOLD}all good.${C_RESET}"
        [[ "$MODE" == "verify" ]] && printf " next: ${C_BOLD}pnpm install && pnpm tauri dev${C_RESET}"
        echo
        exit 0
    fi

    printf "${C_RED}${C_BOLD}%d missing:${C_RESET} %s\n" "${#MISSING[@]}" "${MISSING[*]}"
    [[ "$MODE" == "verify" ]] && printf "re-run with ${C_BOLD}--ci${C_RESET} to install automatically\n"
    exit 1
}

main "$@"
