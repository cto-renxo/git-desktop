@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0script\build-local.ps1" %*
exit /b %errorlevel%
