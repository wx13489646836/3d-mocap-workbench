@echo off
chcp 65001 >nul
setlocal
set "GPUSET=true"
cd /d "%~dp0launch-context"
start "3D动捕工作台" "C:\Users\14984\AppData\Local\Programs\XR Animator\XR-Animator_electron-v37.3.0-win32-x64_SA\electron.exe" "%~dp0engine\AT_SystemAnimator_v110350.gadget\images\XR Animator"
endlocal

