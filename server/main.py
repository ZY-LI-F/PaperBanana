from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.settings import VERSION


app = FastAPI(title="PaperBanana API", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# TODO T05: mount runs router
# app.include_router(runs_router, prefix="/api")

# TODO T05: mount history router
# TODO T05: mount settings router
# TODO T05: mount logs router
# TODO T05: mount refine router
# TODO T05: mount battle router


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "version": VERSION}

