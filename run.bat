@echo off
title Weather Station Base Server
color 0B
echo ====================================================================
echo             INTELLIGENT WEATHER STATION BASE STATION
echo ====================================================================
echo.
echo  Your base station is booting up.
echo.
echo  To connect client laptops/devices, they must be on the SAME WiFi/LAN.
echo  Please find your IPv4 address below (usually starting with 192.168.x.x):
echo.
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    echo   [^>] CLIENT LINK: http:%%i:3000/client
)
echo.
echo  Admin Console: http://localhost:3000/
echo.
echo  Press Ctrl+C in this terminal window to stop the server at any time.
echo ====================================================================
echo.
echo  Starting FastAPI Server...
python server.py
pause
