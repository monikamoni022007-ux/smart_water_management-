@echo off
title AquaLedger - Smart Water Management System
echo ============================================================
echo   AquaLedger - Smart Water Usage Prediction, Leak Detection
echo   and Conservation Management System (OOAD Capstone)
echo ============================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ from https://www.python.org/
    pause
    exit /b 1
)

if not exist ".venv" (
    echo [1/4] Creating Python virtual environment...
    python -m venv .venv
)

echo [2/4] Activating virtual environment...
call .venv\Scripts\activate.bat

echo [3/4] Installing dependencies from requirements.txt...
pip install -r requirements.txt

echo [4/4] Initializing SQLite database and starting Flask server...
echo Open http://127.0.0.1:5000 in your browser.
python app.py
pause
