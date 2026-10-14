#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/scrybe-packaging-test.XXXXXXXX")"
trap 'rm -rf -- "${test_dir}"' EXIT

fail() {
  echo "test failure: $*" >&2
  exit 1
}

assert_contains() {
  [[ "$1" == *"$2"* ]] || fail "expected output to contain: $2"
}

assert_not_contains() {
  [[ "$1" != *"$2"* ]] || fail "unexpected output: $2"
}

fixture="${test_dir}/checkout with spaces"
mkdir -p "${fixture}/utils" "${fixture}/packaging/arch" "${test_dir}/bin"
cp "${project_root}/Makefile" "${fixture}/Makefile"
cp "${project_root}/packaging/arch/PKGBUILD" "${fixture}/packaging/arch/PKGBUILD"
ln -s "${project_root}/utils/packaging" "${fixture}/utils/packaging"
printf 'ID=cachyos\nID_LIKE=arch\n' >"${test_dir}/os-release"

export TEST_PROJECT="${fixture}"
export TEST_LOG="${test_dir}/commands.log"
export TAURI_PACKAGING_UNAME_S=Linux
export TAURI_PACKAGING_MACHINE=x86_64
export TAURI_PACKAGING_OS_RELEASE_FILE="${test_dir}/os-release"
unset ENABLE_INTERNAL

cat >"${test_dir}/bin/container" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'container %s\n' "$@" >>"${TEST_LOG}"
touch "${TEST_PROJECT}/package/scrybe-0.2.16-1-x86_64.pkg.tar.zst"
SH
cat >"${test_dir}/bin/cargo" <<'SH'
#!/usr/bin/env bash
printf '{"target_directory":"%s/target"}\n' "${TEST_PROJECT}"
SH
cat >"${test_dir}/bin/sudo" <<'SH'
#!/usr/bin/env bash
printf 'sudo %s\n' "$@" >>"${TEST_LOG}"
SH
cat >"${test_dir}/bin/pacman" <<'SH'
#!/usr/bin/env bash
echo 'unexpected direct pacman invocation' >&2
exit 1
SH
cat >"${test_dir}/bin/corepack" <<'SH'
#!/usr/bin/env bash
printf 'corepack %s\n' "$*" >>"${TEST_LOG}"
SH
cat >"${test_dir}/bin/pnpm" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == --version ]]; then
  printf '10.26.1\n'
else
  printf 'pnpm %s; mode=%s; internal=%s\n' "$*" "${PUBLIC_UPDATE_INSTALL_MODE:-}" "${ENABLE_INTERNAL:-}" >>"${TEST_LOG}"
fi
SH
chmod +x "${test_dir}/bin/"*
export PATH="${test_dir}/bin:${PATH}"

run_make() {
  make --no-print-directory -C "${fixture}" \
    TAURI_PACKAGING_CONTAINER_RUNTIME="${test_dir}/bin/container" "$@"
}

if output="$(run_make build-internal 2>&1)"; then
  fail 'internal build accepted an incomplete checkout'
fi
assert_contains "${output}" 'Missing internal checkout files:'
[[ ! -e "${TEST_LOG}" ]] || fail 'internal validation ran a build'

mkdir -p "${fixture}/internal/frontend" "${fixture}/internal/rust"
touch "${fixture}/internal/frontend/index.ts" \
  "${fixture}/internal/rust/commands.rs" "${fixture}/internal/rust/mod.rs"

assert_contains "$(run_make -n)" 'tauri dev'
build_output="$(run_make -n build TOKE=custom-toke PNPM=custom-pnpm)"
assert_contains "${build_output}" '/utils/packaging/tauri/build.sh'
assert_contains "${build_output}" '--toke "custom-toke" --pnpm "custom-pnpm"'
assert_contains "${build_output}" '--passthrough-var "ENABLE_INTERNAL"'
assert_contains "$(run_make -n install)" '--build-target "build"'
assert_contains "$(run_make -n install-internal)" '--build-target "build-internal"'
assert_contains "$(run_make -n install TAURI_PACKAGING_MAKE_COMMAND=custom-make)" '--make-command "custom-make"'
assert_contains "$(run_make -n install-internal OS=Windows_NT POWERSHELL=pwsh)" '-BuildTarget "build-internal"'
[[ ! -e "${TEST_LOG}" ]] || fail 'make dry-run executed an external command'

run_make build
assert_not_contains "$(<"${TEST_LOG}")" 'ENABLE_INTERNAL=1'
: >"${TEST_LOG}"
run_make install-internal
log="$(<"${TEST_LOG}")"
assert_contains "${log}" 'container ENABLE_INTERNAL=1'
assert_contains "${log}" 'sudo pacman'
assert_contains "${log}" 'sudo -U'
assert_contains "${log}" 'sudo --noconfirm'
assert_contains "${log}" "sudo ${fixture}/package/scrybe-0.2.16-1-x86_64.pkg.tar.zst"

artifact="${test_dir}/existing package.pkg.tar.zst"
touch "${artifact}"
: >"${TEST_LOG}"
run_make install-internal \
  INTERNAL_FILES=missing-checkout-file \
  TAURI_PACKAGING_INSTALL_ARTIFACT="${artifact}"
log="$(<"${TEST_LOG}")"
assert_contains "${log}" "sudo ${artifact}"
assert_not_contains "${log}" 'container '

(
  export TAURI_PACKAGING_SOURCE_DIR="${project_root}"
  export TAURI_PACKAGING_PKGVER=0.2.16
  export TAURI_PACKAGING_PKGREL=1
  export ENABLE_INTERNAL=1
  srcdir="${test_dir}/makepkg-source"
  pkgdir="${test_dir}/package-root"
  mkdir -p "${srcdir}/cargo-target/release"
  printf '#!/bin/sh\nexit 0\n' >"${srcdir}/cargo-target/release/scrybe"
  source "${project_root}/packaging/arch/PKGBUILD"
  build
  package
  for path in "${_tauri_expected_files[@]}"; do
    [[ -f "${pkgdir}/${path}" ]] || fail "packaged file is missing: ${path}"
  done
  [[ -x "${pkgdir}/usr/bin/scrybe" ]] || fail 'packaged binary is not executable'
  cmp "${project_root}/packaging/arch/scrybe.desktop" "${pkgdir}/usr/share/applications/scrybe.desktop"
)
log="$(<"${TEST_LOG}")"
assert_contains "${log}" 'corepack install --global pnpm@10.26.1'
assert_contains "${log}" 'pnpm install --frozen-lockfile; mode=package-manager; internal=1'
assert_contains "${log}" 'pnpm tauri build --no-bundle; mode=package-manager; internal=1'

"${project_root}/utils/packaging/tauri/test.sh"
echo 'Scrybe packaging integration tests passed'
