#Requires -Version 5.1
<#
.SYNOPSIS
    Verify (default) or install (-CI) scrybe's system dependencies on Windows.
    Mirrors install_deps.sh for macOS and Linux.

.PARAMETER CI
    Install missing dependencies non-interactively via winget and corepack.
    Without -CI, the script only checks and prints install hints.
#>

[CmdletBinding()]
param(
    [switch]$CI
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSCommandPath)

$Mode = if ($CI) { 'install' } else { 'verify' }

$script:Missing = [System.Collections.Generic.List[string]]::new()

function Write-Ok   ([string]$Name)                      { Write-Host "  [OK]   $Name" -ForegroundColor Green }
function Write-Miss ([string]$Name, [string]$Hint)       { Write-Host "  [MISS] $Name -- $Hint" -ForegroundColor Red }
function Write-Warn ([string]$Name, [string]$Hint)       { Write-Host "  [WARN] $Name -- $Hint" -ForegroundColor Yellow }
function Write-Step ([string]$Msg)                       { Write-Host "==> $Msg" -ForegroundColor Cyan }

# Test-Tool <name> <scriptblock:check> <string:install-hint> <scriptblock:install>
# The install scriptblock is invoked only in -CI mode. Omit it (or pass $null) to
# leave a tool as verify-only (we rely on a dedicated CI action to install it).
function Test-Tool {
    param(
        [string]$Name,
        [scriptblock]$Check,
        [string]$Hint,
        [scriptblock]$Install = $null
    )

    $passed = $false
    try { $passed = [bool](& $Check) } catch { $passed = $false }

    if ($passed) {
        Write-Ok $Name
        return
    }

    if ($Mode -eq 'install' -and $Install) {
        Write-Step "installing: $Name"
        try {
            & $Install
            $passed = $false
            try { $passed = [bool](& $Check) } catch { $passed = $false }
            if ($passed) {
                Write-Ok "$Name (installed)"
                return
            }
            Write-Miss $Name 'install failed'
        } catch {
            Write-Miss $Name "install error: $_"
        }
    } else {
        Write-Miss $Name $Hint
    }
    [void]$script:Missing.Add($Name)
}

function Get-PnpmPinnedVersion {
    $pkg = Get-Content -Raw -Path 'package.json' | ConvertFrom-Json
    if ($pkg.packageManager -match '^pnpm@([0-9.]+)') { return $Matches[1] }
    return $null
}

function Test-VswhereHasMsvc {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere)) { return $false }
    $path = & $vswhere -latest -products * `
        -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        -property installationPath 2>$null
    return [bool]$path
}

function Invoke-Checks {
    Write-Step "mode: $Mode"
    Write-Step "os:   Windows ($([System.Environment]::OSVersion.Version))"

    Write-Step 'Windows dependencies'

    Test-Tool 'winget' { Get-Command winget -ErrorAction SilentlyContinue } `
        'install App Installer from the Microsoft Store' $null

    Test-Tool 'cmake' { Get-Command cmake -ErrorAction SilentlyContinue } `
        'winget install -e --id Kitware.CMake' `
        { winget install --accept-source-agreements --accept-package-agreements -e --id Kitware.CMake }

    Test-Tool 'MSVC Build Tools' { Test-VswhereHasMsvc } `
        'install Visual Studio Build Tools (workload: Desktop development with C++). CI uses TheMrMilchmann/setup-msvc-dev.' $null

    Test-Tool 'rustup' { Get-Command rustup -ErrorAction SilentlyContinue } `
        'winget install -e --id Rustlang.Rustup -- then: rustup default stable' $null

    Test-Tool 'Node.js' { Get-Command node -ErrorAction SilentlyContinue } `
        'winget install -e --id OpenJS.NodeJS.LTS' $null

    $pinned = Get-PnpmPinnedVersion
    $pnpmName = if ($pinned) { "pnpm $pinned" } else { 'pnpm' }
    $pnpmInstall = if ($pinned) { "pnpm@$pinned" } else { 'pnpm@latest' }
    Test-Tool $pnpmName { Get-Command pnpm -ErrorAction SilentlyContinue } `
        "corepack enable; corepack prepare $pnpmInstall --activate" `
        { corepack enable; corepack prepare $pnpmInstall --activate }

    if (Get-Command nvcc -ErrorAction SilentlyContinue) {
        Write-Ok 'CUDA toolkit (nvcc)'
    } else {
        Write-Warn 'CUDA toolkit (nvcc)' `
            'scrybe_core sets features=["cuda"] on non-macOS -- install from https://developer.nvidia.com/cuda-downloads (CI uses Jimver/cuda-toolkit action)'
    }
}

function Initialize-Submodules {
    if (Test-Path '.gitmodules') {
        Write-Step 'git submodule update --init --recursive'
        git submodule update --init --recursive
    }
}

Invoke-Checks
Initialize-Submodules

Write-Host ''
if ($script:Missing.Count -eq 0) {
    $msg = 'all good.'
    if ($Mode -eq 'verify') { $msg += ' next: pnpm install; pnpm tauri dev' }
    Write-Host $msg -ForegroundColor Green
    exit 0
}

Write-Host ("{0} missing: {1}" -f $script:Missing.Count, ($script:Missing -join ', ')) -ForegroundColor Red
if ($Mode -eq 'verify') { Write-Host 're-run with -CI to install automatically' }
exit 1
