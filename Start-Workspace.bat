@echo off
title AI Collaborative Workspace Launcher
echo ========================================================
echo   AI-Powered Collaborative Workspace + IDE + WebRTC Meet
echo ========================================================
echo.

echo [1/3] Starting Python ML Delay Predictor (Port 8000)...
start "Workspace ML Service (8000)" /min cmd /k "cd /d C:\dev\workspace-app\ml-service && .\venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"

echo [2/3] Starting Node API + Socket.IO + Hocuspocus CRDT Server (Port 5000)...
start "Workspace Server (5000)" cmd /k "cd /d C:\dev\workspace-app\server && node src/server.js"

echo [3/3] Waiting for services and opening http://localhost:5000 ...
timeout /t 4 /nobreak > nul
start "" "http://localhost:5000"
echo Done! Close the two server windows when you want to shut down.
