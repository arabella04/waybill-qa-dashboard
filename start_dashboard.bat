@echo off
echo ========================================================
echo   Waybill QA & Dispatch Operational Dashboard
echo   Theme: Corporate Blue / Light Blue
echo ========================================================
echo.
echo Starting local Python web server on http://localhost:8080 ...
start "" "http://localhost:8080"
python server.py
pause
