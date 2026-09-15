@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 connection_readiness.py
) else (
  python connection_readiness.py
)
echo.
echo This is an offline check. It does not sign in, send mail, or change cloud services.
pause
