@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 (
    py -3 server.py
    if errorlevel 1 pause
    exit /b
)
where python >nul 2>&1
if errorlevel 1 (
    echo Python 3.9 or newer is required.
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)
python server.py
if errorlevel 1 pause
