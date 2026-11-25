@echo off
title Olympy Go Local Starter
echo ==============================================
echo        Olympy Go Serverlarini Ishga Tushirish
echo ==============================================

cd /d "%~dp0"

echo [1/2] Go Backend ishga tushirilmoqda...
start "Olympy Go Backend" cmd /k "set GOROOT=C:\Users\BENXUR\go && set PATH=C:\Users\BENXUR\go\bin;%%PATH%% && cd backend && go run cmd/api/main.go"

echo [2/2] Frontend (Vite) ishga tushirilmoqda...
start "Olympy Frontend" cmd /k "set PATH=C:\Program Files\nodejs;%%PATH%% && npm.cmd run dev"

echo.
echo Tayyor!
echo Frontend manzili: http://127.0.0.1:5173
echo Go Backend:       http://127.0.0.1:8000
echo Swagger API Docs: http://127.0.0.1:8000/api/docs/
echo.
pause
