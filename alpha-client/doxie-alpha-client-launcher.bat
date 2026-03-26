@echo off
echo DoxieGuard Alpha Client
echo =========================
echo Starting certificate scanner...
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0doxie-alpha-client.ps1"
pause
