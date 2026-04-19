from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import Field

from server.repos.battle_repo import list_battles
from server.routers.runs import GenerateRequest
from server.services import run_service


BATTLE_WAIT_SECONDS = 1.0
BATTLE_WAIT_INTERVAL_SECONDS = 0.01

router = APIRouter(prefix="/api", tags=["battle"])


class BattleRequest(GenerateRequest):
    image_models: list[str] = Field(min_length=2)


@router.post("/battle")
async def create_battle(request: BattleRequest) -> dict[str, object]:
    try:
        parent_run_id = run_service.start_battle(request.to_params(), request.image_models)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    battle_ids = await _wait_for_battle_ids(parent_run_id, len(request.image_models))
    return {"parent_run_id": parent_run_id, "battle_ids": battle_ids}


async def _wait_for_battle_ids(parent_run_id: str, expected: int) -> list[str]:
    deadline = asyncio.get_running_loop().time() + BATTLE_WAIT_SECONDS
    while True:
        rows = list_battles(parent_run_id)
        if len(rows) >= expected or asyncio.get_running_loop().time() >= deadline:
            return [row.id for row in rows]
        await asyncio.sleep(BATTLE_WAIT_INTERVAL_SECONDS)
