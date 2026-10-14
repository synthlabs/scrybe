param(
    [string]$ExePath = "target/release/scrybe.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ExePath)) {
    Write-Error "Executable not found: $ExePath"
}

$tool = Get-Command dumpbin -ErrorAction SilentlyContinue
if ($tool) {
    $output = & $tool.Source /DEPENDENTS $ExePath 2>&1
} else {
    $tool = Get-Command llvm-objdump -ErrorAction SilentlyContinue
    if ($tool) {
        $output = & $tool.Source -p $ExePath 2>&1
    } else {
        $tool = Get-Command objdump -ErrorAction SilentlyContinue
        if ($tool) {
            $output = & $tool.Source -p $ExePath 2>&1
        } else {
            Write-Error "Install dumpbin, llvm-objdump, or objdump to inspect PE imports."
        }
    }
}

$matches = $output | Select-String -Pattern "cuda|cudart|cublas" -CaseSensitive:$false
if (-not $matches) {
    Write-Error "No CUDA imports found in $ExePath. Rebuild with CUDA enabled and run this script again."
}

Write-Host "CUDA imports found in ${ExePath}:"
$matches | ForEach-Object { Write-Host $_.Line.Trim() }
