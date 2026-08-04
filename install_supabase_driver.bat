@echo off
setlocal
cd /d "%~dp0"
if not exist ".tmp" mkdir ".tmp"
set "LOG_FILE=%~dp0.tmp\supabase-driver-install.log"

echo Installing PostgreSQL driver...
echo Started: %date% %time% > "%LOG_FILE%"
"%~dp0backend\.venv\Scripts\python.exe" -m pip install --index-url https://pypi.org/simple "psycopg[binary]>=3.2.0" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto failed

"%~dp0backend\.venv\Scripts\python.exe" -c "import psycopg; print('SUCCESS: psycopg ' + psycopg.__version__)" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto failed

type "%LOG_FILE%"
echo.
echo INSTALL SUCCESS. Keep this window open and return to Codex.
pause
exit /b 0

:failed
type "%LOG_FILE%"
echo.
echo INSTALL FAILED. Keep this window open and send a screenshot to Codex.
pause
exit /b 1
