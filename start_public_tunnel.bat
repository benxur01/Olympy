@echo off
title Olympy Cloudflare Internet Tunnel
echo ====================================================
echo    Olympy - Dunyo boylab ochish uchun havola (Cloudflare)
echo ====================================================
echo.
echo Cloudflare Tunnel ishga tushirilmoqda...
echo.
"%~dp0..\..\cloudflared.exe" tunnel --url http://127.0.0.1:5173
if errorlevel 1 (
  "%USERPROFILE%\Downloads\cloudflared.exe" tunnel --url http://127.0.0.1:5173
)
pause
