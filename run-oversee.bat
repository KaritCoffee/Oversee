@echo off
setlocal
cd /d "%~dp0"
echo Starting Oversee from %CD%
echo.
"C:\Program Files\nodejs\node.exe" "%~dp0server.js"
set EXIT_CODE=%ERRORLEVEL%
echo.
echo Oversee exited with code %EXIT_CODE%.
pause
