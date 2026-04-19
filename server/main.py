from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.routers import (
    battle_router,
    history_router,
    logs_router,
    refine_router,
    runs_router,
    settings_router,
)
from server.settings import VERSION


app = FastAPI(title="PaperBanana API", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

app.include_router(runs_router)
app.include_router(history_router)
app.include_router(settings_router)
app.include_router(logs_router)
app.include_router(refine_router)
app.include_router(battle_router)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "version": VERSION}

