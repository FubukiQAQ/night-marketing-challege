@echo off
rem ===============================================================
rem  HD pixel-art batch runner  (Qwen-Image NVFP4 + perfectPixel)
rem  Resumable: safe to close any time, rerun to continue.
rem
rem  usage:
rem    RUN_ART.bat                 run everything (resume)
rem    RUN_ART.bat --plan          show queue + ETA only
rem    RUN_ART.bat --categories ing --max-gen 12
rem    RUN_ART.bat --retry-failed
rem    RUN_ART.bat --sheet off --only food_lamb_skewer
rem ===============================================================
setlocal
set "PY=D:\QwenImage\venv\Scripts\python.exe"
set "ROOT=%~dp0"

if not exist "%PY%" (
  echo [ERROR] ComfyUI venv not found: %PY%
  pause & exit /b 1
)

rem make sure ComfyUI is up first
"%PY%" -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8188/system_stats',timeout=5)" 2>nul
if errorlevel 1 (
  echo [INFO] ComfyUI is not running, starting it ...
  start "" /min cmd /c "D:\QwenImage\start_comfyui.bat"
  echo [INFO] waiting for ComfyUI to load the NVFP4 model ...
  timeout /t 45 /nobreak >nul
)

cd /d "%ROOT%"
"%PY%" tools\artgen_all.py %*
echo.
echo [done] progress : assets\art_hd\_state.json
echo [log  ] log      : assets\art_hd\_run.log
echo [bak  ] raw backup: assets\art_hd\_raw   (sheet / cell originals)
pause
endlocal
