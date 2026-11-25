@echo off
echo ========================================================
echo       Olympy - Go Backend Serverini Ishga Tushirish
echo ========================================================
echo.

cd /d "%~dp0"

if exist "C:\Users\BENXUR\go\bin\go.exe" (
    set "GOROOT=C:\Users\BENXUR\go"
    set "PATH=C:\Users\BENXUR\go\bin;%PATH%"
)
set "CGO_ENABLED=0"

echo [1/3] Go o'rnatilganligini tekshirish...
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo [XATOLIK] Go kompyuteringizda topilmadi yoki PATH ga qoshilmagan.
    echo Iltimos, Go ni o'rnating yoki terminalni qayta oching.
    pause
    exit /b 1
)

echo [2/3] Kerakli paketlarni tekshirish...
go mod tidy

echo [3/3] Server ishga tushirilmoqda...
echo API server manzili: http://127.0.0.1:8000
echo.
go run ./cmd/api

pause
