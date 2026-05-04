# Scrybe-specific Windows extras. Dot-sourced by utils/scripts/install_deps.ps1.

Write-Step 'scrybe Windows extras'

if (Get-Command nvcc -ErrorAction SilentlyContinue) {
    Write-Ok 'CUDA toolkit (nvcc)'
} else {
    Write-Warn 'CUDA toolkit (nvcc)' `
        'scrybe_core enables CUDA for Windows builds -- install from https://developer.nvidia.com/cuda-downloads (CI uses Jimver/cuda-toolkit action)'
}
