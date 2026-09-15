@echo off
setlocal
cd /d "%~dp0"
echo Macrotech Quotation Pilot - transparent local build
echo This readable script creates the actual application EXE in READY_TO_TEST.
echo It does not connect to or modify either Tracker during the build.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_windows_exe.ps1"
set "MACROTECH_BUILD_EXIT=%ERRORLEVEL%"
echo.
if not "%MACROTECH_BUILD_EXIT%"=="0" (
  echo BUILD FAILED. Review the message above.
) else (
  echo BUILD COMPLETE.
  echo Open READY_TO_TEST\Macrotech Quotation Pilot Demo
  start "" "%~dp0READY_TO_TEST\Macrotech Quotation Pilot Demo"
)
pause
exit /b %MACROTECH_BUILD_EXIT%
