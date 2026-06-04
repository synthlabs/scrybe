param(
    [string]$BinaryPath,
    [string]$StagedDir = "target/windows-cuda-redist/resources/cuda",
    [string]$HookPath = "target/windows-cuda-redist/cuda-redist-hooks.nsh"
)

$ErrorActionPreference = "Stop"

if (-not $BinaryPath) {
    $BinaryPath = Join-Path (Get-Location) "target/release/scrybe.exe"
}

$BinaryPath = (Resolve-Path -LiteralPath $BinaryPath).Path
$StagedDir = (Resolve-Path -LiteralPath $StagedDir).Path
$HookPath = (Resolve-Path -LiteralPath $HookPath).Path

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

$stagedDlls = Get-ChildItem -LiteralPath $StagedDir -Filter "*.dll" |
    Select-Object -ExpandProperty Name

if (-not $stagedDlls) {
    throw "No staged CUDA DLLs found in $StagedDir."
}

$stagedSet = New-Object System.Collections.Generic.HashSet[string]
$stagedDlls | ForEach-Object { [void]$stagedSet.Add($_.ToLowerInvariant()) }

$directCudaImports = Get-ImportedDlls -Path $BinaryPath |
    Where-Object { $stagedSet.Contains($_.ToLowerInvariant()) }

if (-not $directCudaImports) {
    throw "No direct staged CUDA import found in $BinaryPath."
}

foreach ($dll in $stagedDlls) {
    $dllPath = Join-Path $StagedDir $dll
    foreach ($import in Get-ImportedDlls -Path $dllPath) {
        if ($import -match '^(cuda|cu|cublas|cufft|curand|cusolver|cusparse|npp|nv).*\.dll$' -and
            $import -ine "nvcuda.dll" -and
            -not $stagedSet.Contains($import.ToLowerInvariant())) {
            throw "$dll imports CUDA DLL $import, but it was not staged."
        }
    }
}

$hook = Get-Content -LiteralPath $HookPath -Raw
foreach ($dll in $stagedDlls) {
    if ($hook -notmatch [regex]::Escape("\resources\cuda\$dll") -or
        $hook -notmatch [regex]::Escape("\$dll")) {
        throw "$dll is missing from generated NSIS hooks."
    }
}

foreach ($licenseName in @("EULA.txt", "LICENSE")) {
    if (-not (Test-Path -LiteralPath (Join-Path $StagedDir $licenseName))) {
        throw "Missing staged CUDA license file: $licenseName"
    }
}

Write-Host "Verified staged CUDA runtime:"
$stagedDlls | Sort-Object | ForEach-Object { Write-Host "  $_" }
