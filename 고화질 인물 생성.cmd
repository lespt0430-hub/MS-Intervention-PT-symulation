@echo off
chcp 65001 > nul
setlocal
cd /d "%~dp0"

echo.
echo   환자 12명과 치료사 4명의 고화질 3D 모델을 생성합니다.
echo   Blender 창은 백그라운드 모드로 실행되며 몇 분 걸릴 수 있습니다.
echo.

node tools\build-humans.mjs --high
set RESULT=%ERRORLEVEL%

echo.
if "%RESULT%"=="0" (
  echo   완료: assets\humans_high 폴더에 고화질 모델이 생성되었습니다.
) else (
  echo   생성 중 오류가 발생했습니다. 위쪽 오류 내용을 확인해 주세요.
)
echo.
pause
exit /b %RESULT%
