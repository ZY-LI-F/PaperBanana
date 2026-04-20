from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import server.settings as settings
from server.db import connect, init_db
from server.routers import (
    battle_router,
    examples_router,
    history_router,
    logs_router,
    refine_router,
    runs_router,
    settings_router,
)
from server.seeds.examples_seed import seed_if_empty
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
app.include_router(examples_router)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "version": VERSION}


@app.on_event("startup")
async def startup() -> None:
    _prepare_examples_store()


def _prepare_examples_store() -> None:
    init_db()
    _examples_dir().mkdir(parents=True, exist_ok=True)
    connection = connect()
    try:
        with connection:
            seed_if_empty(connection)
    finally:
        connection.close()


def _examples_dir() -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured).parent / "examples"
