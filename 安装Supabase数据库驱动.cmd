@echo off
chcp 65001 >nul
title 安装 Supabase 数据库驱动
cd /d "%~dp0"
if not exist ".tmp" mkdir ".tmp"
set "INSTALL_LOG=.tmp\supabase-driver-install.log"

echo 正在安装 Supabase PostgreSQL 数据库驱动，请稍候...
echo 安装开始：%date% %time% > "%INSTALL_LOG%"
backend\.venv\Scripts\python.exe -m pip install --index-url https://pypi.org/simple "psycopg[binary]>=3.2.0" >> "%INSTALL_LOG%" 2>&1

if errorlevel 1 (
  echo.
  echo 安装失败。错误日志已经保存到：
  echo %cd%\%INSTALL_LOG%
  echo.
  type "%INSTALL_LOG%"
  pause
  exit /b 1
)

echo.
backend\.venv\Scripts\python.exe -c "import psycopg; print('数据库驱动安装成功，版本：' + psycopg.__version__)" >> "%INSTALL_LOG%" 2>&1
if errorlevel 1 (
  echo 驱动下载完成，但验证失败。请把窗口截图发给 Codex。
  type "%INSTALL_LOG%"
  pause
  exit /b 1
)
type "%INSTALL_LOG%"
echo.
echo 安装已经完成，请回到 Codex 告诉我：安装成功。
pause
