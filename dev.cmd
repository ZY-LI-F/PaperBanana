@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   PaperBanana dev launcher
echo ========================================

echo.
echo [1/2] Starting FastAPI backend on http://127.0.0.1:8000 ...
start "PaperBanana API" cmd /k python -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir server

echo [2/2] Starting Vite frontend (tries :5173, falls back to :5174) ...
start "PaperBanana Web" cmd /k "cd web && npm run dev"

echo.
echo Both services launched in their own windows:
echo   API   http://127.0.0.1:8000/api/health
echo   Web   http://localhost:5173   (or :5174 if 5173 is busy)
echo   Refs  http://localhost:5173/refs
echo.
echo Close the two child windows to stop each service.
endlocal
