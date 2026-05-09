!include /NONFATAL "../../target/windows-cuda-redist/cuda-redist-hooks.nsh"

!macro NSIS_HOOK_POSTINSTALL
  !ifdef SCRYBE_CUDA_REDIST_HOOKS_INCLUDED
    !insertmacro ScrybeCopyCudaRuntime
  !endif
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !ifdef SCRYBE_CUDA_REDIST_HOOKS_INCLUDED
    !insertmacro ScrybeDeleteCudaRuntime
  !endif
!macroend
