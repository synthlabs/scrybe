param(
    [string]$OutDir = "target/windows-cuda-redist"
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$ResourceDir = Join-Path $RepoRoot (Join-Path $OutDir "resources/cuda")

New-Item -ItemType Directory -Force -Path $ResourceDir | Out-Null

$pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpm) {
    $pnpm = Get-Command pnpm -ErrorAction Stop
}

Push-Location $RepoRoot
try {
    & $pnpm.Source build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
