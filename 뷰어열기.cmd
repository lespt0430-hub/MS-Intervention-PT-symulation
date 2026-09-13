@echo off
setlocal enabledelayedexpansion
rem ---------------------------------------------------------------------
rem  Human model viewer launcher  (double-click to run)
rem
rem  Browsers block file:// pages from reading .glb, so the viewer has to be
rem  served over http. This script starts a local server and opens it.
rem  Close this window to stop the server.
rem
rem  NOTE: keep this file ASCII-only. cmd.exe parses batch files using the
rem  console's ANSI codepage, which is not UTF-8 -- Korean comments here get
rem  read as garbage bytes and cmd then tries to run them as commands.
rem  (Korean text belongs in the docs, not in this file.)
rem ---------------------------------------------------------------------

cd /d "%~dp0"

rem Find a free port starting at 8777 (8000 and 8080 collide too often).
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
echo    Human model viewer
echo    http://localhost:!PORT!/tools/viewer.html
echo.
echo    The browser opens automatically.
echo    Closing this window stops the viewer.
echo.

start "" "http://localhost:!PORT!/tools/viewer.html"

where py > nul 2>&1
if errorlevel 1 (
  python -m http.server !PORT!
) else (
  py -m http.server !PORT!
)

echo.
echo    Server stopped. Check that Python is installed.
pause
