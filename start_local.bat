@echo off
title Olympy Local Starter (Go Powered)
echo ==============================================
echo        Olympy Serverlarini Ishga Tushirish
echo        Backend: Go (Golang) 1.22+
echo        Frontend: Vite + React
echo ==============================================

cd /d "%~dp0"

echo [1/2] Go Backend ishga tushirilmoqda...
start "Olympy Go Backend" cmd /k "set PATH=C:\Users\BENXUR\go\bin;%%PATH%% && cd backend && go run cmd/api/main.go"

echo [2/2] Frontend (Vite) ishga tushirilmoqda...
start "Olympy Frontend" cmd /k "set PATH=C:\Program Files\nodejs;%%PATH%% && npm.cmd run dev"

echo.
echo Tayyor! Barcha xizmatlar Go backend bilan ishlamoqda.
echo Frontend manzili: http://127.0.0.1:5173
echo Backend (Go):     http://127.0.0.1:8000
echo Swagger API Docs: http://127.0.0.1:8000/api/docs/
echo.
pause
