from __future__ import annotations

import asyncio
import base64
import binascii
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import server.settings as settings
from server.repos import runs_repo
from server.routers.runs import build_image_url
from server.services import run_service


REFINE_WAIT_SECONDS = 5.0
REFINE_WAIT_INTERVAL_SECONDS = 0.01
TERMINAL_STATUSES = {"succeeded", "failed", "cancelled", "paused"}

router = APIRouter(prefix="/api", tags=["refine"])


class RefineRequest(BaseModel):
    image_base64: str
    edit_prompt: str
    image_model: str = ""
    aspect_ratio: str = "21:9"
    image_size: str = "2K"


@router.post("/refine")
async def refine_image(request: RefineRequest) -> dict[str, str]:
    image_bytes = _decode_image(request.image_base64)
    try:
        run_id = run_service.start_refine(
            run_service.RefineParams(
                image_bytes=image_bytes,
                edit_prompt=request.edit_prompt,
                image_model=request.image_model,
                aspect_ratio=request.aspect_ratio,
                image_size=request.image_size,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    row = await _wait_for_run(run_id)
    if row.status != "succeeded":
        raise HTTPException(status_code=400, detail=row.error or "refine failed")
    if not row.final_image_path:
        raise HTTPException(status_code=500, detail="missing refine output path")

    image_path = _results_dir() / row.final_image_path
    if not image_path.is_file():
        raise HTTPException(status_code=500, detail="refine output missing")
    image_base64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    return {
        "run_id": run_id,
        "final_image_path": row.final_image_path,
        "image_base64": image_base64,
        "image_url": build_image_url(run_id, row.final_image_path),
    }


def _decode_image(image_base64: str) -> bytes:
    try:
        data = base64.b64decode(image_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="image_base64 must be valid base64") from exc
    if not data:
        raise HTTPException(status_code=400, detail="image_base64 must not be empty")
    return data


async def _wait_for_run(run_id: str) -> runs_repo.RunRow:
    deadline = asyncio.get_running_loop().time() + REFINE_WAIT_SECONDS
    while True:
        row = runs_repo.get_run(run_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"unknown run id: {run_id}")
        if row.status in TERMINAL_STATUSES:
            return row
        if asyncio.get_running_loop().time() >= deadline:
            raise HTTPException(status_code=504, detail="refine timed out")
        await asyncio.sleep(REFINE_WAIT_INTERVAL_SECONDS)


def _results_dir() -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured).parent
