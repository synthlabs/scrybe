param(
    [string]$BinaryPath,
    [string]$CudaPath = $env:CUDA_PATH,
    [string]$OutDir = "target/windows-cuda-redist"
)

$ErrorActionPreference = "Stop"

if (-not $BinaryPath) {
    $BinaryPath = Join-Path (Get-Location) "target/release/scrybe.exe"
}

$BinaryPath = (Resolve-Path -LiteralPath $BinaryPath).Path

if (-not $CudaPath) {
    throw "CUDA_PATH is not set; cannot stage CUDA runtime DLLs."
}

$CudaBin = Join-Path $CudaPath "bin/x64"
if (-not (Test-Path -LiteralPath $CudaBin)) {
    $CudaBin = Join-Path $CudaPath "bin"
}
if (-not (Test-Path -LiteralPath $CudaBin)) {
    throw "Could not find CUDA bin directory under $CudaPath."
}

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$OutRoot = Join-Path $RepoRoot $OutDir
$ResourceDir = Join-Path $OutRoot "resources/cuda"
$HookPath = Join-Path $OutRoot "cuda-redist-hooks.nsh"

New-Item -ItemType Directory -Force -Path $ResourceDir | Out-Null

function Get-ImportedDlls {
    param([string]$Path)

    $dlls = New-Object System.Collections.Generic.HashSet[string]
    $dumpbin = Get-Command dumpbin -ErrorAction SilentlyContinue
    if ($dumpbin) {
        $output = & $dumpbin.Source /DEPENDENTS $Path 2>$null
        foreach ($line in $output) {
            $candidate = $line.Trim()
            if ($candidate -match '^[A-Za-z0-9_.+-]+\.dll$') {
                [void]$dlls.Add($candidate)
            }
        }
    } else {
        $objdump = Get-Command objdump -ErrorAction SilentlyContinue
        if (-not $objdump) {
            throw "Neither dumpbin nor objdump is available to inspect DLL imports."
        }

        $output = & $objdump.Source -p $Path
        foreach ($line in $output) {
            if ($line -match 'DLL Name:\s*(?<name>[A-Za-z0-9_.+-]+\.dll)') {
                [void]$dlls.Add($Matches.name)
            }
        }
    }

    return $dlls
}

function Resolve-CudaDll {
    param([string]$Name)

    if ($Name -ieq "nvcuda.dll") {
        return $null
    }

    $path = Join-Path $CudaBin $Name
    if (Test-Path -LiteralPath $path) {
        return (Resolve-Path -LiteralPath $path).Path
    }

    return $null
}

$seen = New-Object System.Collections.Generic.HashSet[string]
$queue = New-Object System.Collections.Generic.Queue[string]

foreach ($dll in Get-ImportedDlls -Path $BinaryPath) {
    $resolved = Resolve-CudaDll -Name $dll
    if ($resolved) {
        $queue.Enqueue($resolved)
    }
}

while ($queue.Count -gt 0) {
    $dllPath = $queue.Dequeue()
    $name = Split-Path -Leaf $dllPath
    if (-not $seen.Add($name.ToLowerInvariant())) {
        continue
    }

    Copy-Item -LiteralPath $dllPath -Destination (Join-Path $ResourceDir $name) -Force

    foreach ($import in Get-ImportedDlls -Path $dllPath) {
        $resolved = Resolve-CudaDll -Name $import
        if ($resolved -and -not $seen.Contains((Split-Path -Leaf $resolved).ToLowerInvariant())) {
            $queue.Enqueue($resolved)
        }
    }
}

if ($seen.Count -eq 0) {
    throw "No CUDA runtime DLL imports were found in $BinaryPath."
}

foreach ($licenseName in @("EULA.txt", "LICENSE")) {
    $licensePath = Join-Path $CudaPath $licenseName
    if (-not (Test-Path -LiteralPath $licensePath)) {
        throw "Required CUDA license file not found: $licensePath"
    }
    Copy-Item -LiteralPath $licensePath -Destination (Join-Path $ResourceDir $licenseName) -Force
}

$dllNames = Get-ChildItem -LiteralPath $ResourceDir -Filter "*.dll" |
    Sort-Object Name |
    Select-Object -ExpandProperty Name

$hookLines = @(
    "!define SCRYBE_CUDA_REDIST_HOOKS_INCLUDED",
    "",
    "!macro ScrybeCopyCudaRuntime",
    "  SetOutPath `"`$INSTDIR`""
)

foreach ($name in $dllNames) {
    $hookLines += "  IfFileExists `"`$INSTDIR\resources\cuda\$name`" 0 +2"
    $hookLines += "  CopyFiles /SILENT `"`$INSTDIR\resources\cuda\$name`" `"`$INSTDIR\$name`""
}

$hookLines += @(
    "!macroend",
    "",
    "!macro ScrybeDeleteCudaRuntime"
)

foreach ($name in $dllNames) {
    $hookLines += "  Delete `"`$INSTDIR\$name`""
}

$hookLines += @(
    "!macroend",
    ""
)

Set-Content -LiteralPath $HookPath -Value $hookLines -Encoding UTF8

Write-Host "Staged CUDA runtime DLLs:"
$dllNames | ForEach-Object { Write-Host "  $_" }
Write-Host "Generated $HookPath"
