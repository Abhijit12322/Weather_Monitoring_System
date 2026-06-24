@echo off
title Weather Station Client Dashboard (Next.js)
color 09
echo ====================================================================
echo             INTELLIGENT WEATHER STATION NEXT.JS DASHBOARD
echo ====================================================================
echo.
echo  Your Next.js dashboard is booting up.
echo.
echo  To access it from other client laptops on the network,
echo  open your browser (Microsoft Edge recommended) and navigate to:
echo.
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    echo   [^>] CLIENT DASHBOARD: http:%%i:3000/client
)
echo.
echo  Local Dashboard Link: http://localhost:3000/
echo.
echo  Press Ctrl+C to stop the Next.js server at any time.
echo ====================================================================
echo.
echo  Starting Next.js Server on port 3000...
cd frontend
npx next dev -H 0.0.0.0 -p 3000
pause
