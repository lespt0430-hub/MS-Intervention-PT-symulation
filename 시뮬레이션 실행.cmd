@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set PORT=
for /l %%i in (0,1,9) do (
  if not defined PORT (
    set /a TRY=8777+%%i
    netstat -ano | findstr /r /c:":!TRY! .*LISTENING" > nul
    if errorlevel 1 set PORT=!TRY!
  )
)
if not defined PORT set PORT=8777

echo.
echo   Virtual Patient Simulation
echo   http://localhost:!PORT!/
echo.
echo   Keep this window open while using the simulation.
echo   Close this window to stop the local server.
echo.

start "" "http://localhost:!PORT!/"
where py > nul 2>&1
if errorlevel 1 (
  python -m http.server !PORT! --bind 127.0.0.1
) else (
  py -m http.server !PORT! --bind 127.0.0.1
)

echo.
echo   Server stopped. Install Python if the browser did not open.
pause
