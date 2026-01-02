Section
    ; Check if the VC++ Redistributable is already installed
    ReadRegStr $0 HKLM "SOFTWARE\NVIDIA Corporation\GPU Computing Toolkit\CUDA\v13.0" "64BitInstalled"
    
    ${If} $0 != ""
        DetailPrint "Nvidia CUDA v13 found! Skipping installation."
    ${Else}
        StrCpy $0 "https://developer.download.nvidia.com/compute/cuda/13.1.0/local_installers/cuda_13.1.0_windows.exe"
        StrCpy $1 "$TEMP\cuda_windows.exe"

        inetc::get $0 $1
        Pop $0
        ${If} $0 == "success"
            DetailPrint "Nvidia CUDA downloaded successfully"
        ${Else}
            DetailPrint "Nvidia CUDA failed to download"
            Call InstallFailed
            Abort "Nvidia CUDA download failed, aborting installation"
        ${EndIf}

        ; Execute the downloaded installer
        ExecWait '"$1" -s -n' $0
        ${If} $0 == 0
            DetailPrint "Nvidia CUDA installation completed successfully"
        ${Else}
            DetailPrint "Nvidia CUDA installation failed"
            Call InstallFailed
            Abort "Nvidia CUDA installation failed"
        ${EndIf}
    ${EndIf}
SectionEnd


Function InstallFailed
    DetailPrint "Nvidia CUDA failed to download"
    ; Show a message box to inform the user
    MessageBox MB_OK|MB_ICONEXCLAMATION "Failed to download Nvidia CUDA. Please download and install it manually."
    ; Open the URL in the default browser
    ExecShell "open" "https://developer.download.nvidia.com/compute/cuda/13.1.0/local_installers/cuda_13.1.0_windows.exe"
FunctionEnd

Function Cleanup
    DetailPrint "Cleaning up CUDA installer"
    Delete "$TEMP\cuda_windows.exe"
FunctionEnd