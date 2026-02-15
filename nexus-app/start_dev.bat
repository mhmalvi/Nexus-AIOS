@echo off
echo 🚀 Starting Nexus AIOS Dev Environment...

echo 🔧 Configuring Environment...
:: Add Rust to PATH
set "RUST_PATH=%USERPROFILE%\.cargo\bin"
if exist "%RUST_PATH%" (
    echo    Found Rust at: %RUST_PATH%
    set "PATH=%RUST_PATH%;%PATH%"
) else (
    echo ⚠️ Rust not found in standard location: %RUST_PATH%
    echo    Please ensure Rust is installed and in your PATH.
)

echo 📦 Checking Python Environment...
cd nexus-app\kernel
if not exist "venv" (
    echo 🐍 Creating Python Virtual Environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo 📥 Installing dependencies...
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate.bat
)
cd ..\..

echo 🦀 Starting Tauri App...
where cargo
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Cargo not found! Exiting.
    pause
    exit /b 1
)

cd nexus-app
npm run tauri dev
