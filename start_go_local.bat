@echo off
title Olympy Go Local Starter
echo ==============================================
echo        Olympy Go Serverlarini Ishga Tushirish
echo ==============================================

cd /d "%~dp0"

if exist "C:\Users\BENXUR\go\bin\go.exe" (
    set "GOROOT=C:\Users\BENXUR\go"
    set "PATH=C:\Users\BENXUR\go\bin;%PATH%"
)
if exist "C:\Program Files\nodejs\npm.cmd" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)
set "CGO_ENABLED=0"

echo [1/2] Go Backend ishga tushirilmoqda...
start "Olympy Go Backend" cmd /k "cd /d "%~dp0backend" && go run ./cmd/api"

echo [2/2] Frontend (Vite) ishga tushirilmoqda...
start "Olympy Frontend" cmd /k "cd /d "%~dp0" && npm.cmd run dev"

echo.
echo Tayyor!
echo Frontend manzili: http://localhost:5173
echo Go Backend:       http://127.0.0.1:8000
echo Swagger API Docs: http://127.0.0.1:8000/api/docs/
echo.
pause
