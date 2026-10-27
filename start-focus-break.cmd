@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser.
echo Press Ctrl+C to stop.
node scripts\serve.mjs
if errorlevel 1 pause
