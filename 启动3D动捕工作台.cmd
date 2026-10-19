@echo off
chcp 65001 >nul
setlocal
set "GPUSET=true"
cd /d "%~dp0launch-context"
start "3D动捕工作台" "%~dp0runtime\electron\electron.exe" "%~dp0app" "%~dp0engine\AT_SystemAnimator_v110350.gadget\images\XR Animator"
endlocal