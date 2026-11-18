# Smart Water Usage Prediction, Leak Detection and Conservation Management System

A software-only Object-Oriented Analysis and Design (OOAD) capstone web application built with **Python, Flask, SQLite, Pandas, NumPy, Scikit-learn, HTML/CSS/JavaScript, and Chart.js**.

## Running on Windows

1. Ensure **Python 3.10+** is installed and checked on PATH.
2. Open this `flask_app` folder and double-click `start.bat`, **or** run manually in Command Prompt / PowerShell:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

3. Open `http://127.0.0.1:5000` in your browser.

## Demo Accounts

- **Primary 92-Day Household:** `alex@aqualedger.edu` / `demo123`
- **Secondary Apartment (Isolation Demo):** `priya@aqualedger.edu` / `demo123`

## Running Tests

```bat
python -m unittest discover -s tests -v
```
