from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import server.settings as settings
from server.repos import battle_repo, runs_repo
from server.repos.battle_repo import BattleRunRow
from server.repos.runs_repo import RunRow, StageRow
from server.services import run_service
from server.services.log_bus import log_bus


EVENT_RETRY_MS = 5_000
RUNS_PREFIX = "runs"
TERMINAL_STATUSES = {"succeeded", "failed", "cancelled", "paused"}

router = APIRouter(prefix="/api", tags=["runs"])


class GenerateRequest(BaseModel):
    method_content: str
    caption: str
    exp_mode: str
    main_model: str = ""
    image_model: str = ""
    retrieval_setting: str = "auto"
    num_candidates: int = 1
    aspect_ratio: str = "16:9"
    figure_size: str | None = None
    figure_language: str | None = None
    max_critic_rounds: int = 3
    parent_run_id: str | None = None

    def to_params(self) -> run_service.GenerateParams:
        return run_service.GenerateParams(
            method_content=self.method_content,
            caption=self.caption,
            exp_mode=self.exp_mode,
            main_model=self.main_model,
            image_model=self.image_model,
            retrieval_setting=self.retrieval_setting,
            num_candidates=self.num_candidates,
            aspect_ratio=self.aspect_ratio,
            figure_size=self.figure_size,
            figure_language=self.figure_language,
            max_critic_rounds=self.max_critic_rounds,
        )


@router.post("/runs")
async def create_run(request: GenerateRequest) -> dict[str, str]:
    if request.parent_run_id:
        _require_run(request.parent_run_id)
    try:
        run_id = run_service.start_generate(request.to_params())
    except ValueError as exc:
        raise _http_error(exc) from exc
    if request.parent_run_id:
        runs_repo.update_run(run_id, parent_run_id=request.parent_run_id)
    return {"run_id": run_id}


@router.get("/runs/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    row = _require_run(run_id)
    payload = run_to_dict(row)
    payload["stages"] = [stage_to_dict(run_id, stage) for stage in runs_repo.list_stages(run_id)]
    payload["battles"] = [battle_to_dict(run_id, battle) for battle in battle_repo.list_battles(run_id)]
    payload["reuse"] = build_reuse_payload(row)
    return payload


@router.post("/runs/{run_id}/cancel", status_code=204)
async def cancel_run(run_id: str) -> Response:
    _require_run(run_id)
    run_service.cancel(run_id)
    return Response(status_code=204)


@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: str) -> dict[str, str]:
    _require_run(run_id)
    try:
        new_run_id = run_service.resume(run_id)
    except ValueError as exc:
        raise _http_error(exc) from exc
    return {"run_id": new_run_id}


@router.get("/runs/{run_id}/events")
async def run_events(
    run_id: str,
    limit: int | None = Query(None, ge=1),
) -> EventSourceResponse:
    _require_run(run_id)
    return EventSourceResponse(_run_event_stream(run_id, limit))


@router.get("/runs/{run_id}/image/{name:path}")
async def get_run_image(run_id: str, name: str) -> FileResponse:
    _require_run(run_id)
    path = _resolve_image_path(run_id, name)
    return FileResponse(path, media_type="image/png")


async def _run_event_stream(run_id: str, limit: int | None):
    row = _require_run(run_id)
    sent = 0
    yield _sse("run", run_to_dict(row))
    sent += 1
    if _limit_reached(limit, sent):
        return
    for stage in runs_repo.list_stages(run_id):
        yield _sse("stage", stage_to_dict(run_id, stage))
        sent += 1
        if _limit_reached(limit, sent):
            return

    known_status = row.status
    async for event in log_bus.subscribe(run_id):
        yield _sse("log", event, event_id=event["seq"])
        sent += 1
        if _limit_reached(limit, sent):
            return
        current = _require_run(run_id)
        if event.get("stage"):
            stage = _find_stage(run_id, event["stage"])
            if stage is not None:
                yield _sse("stage", stage_to_dict(run_id, stage), event_id=event["seq"])
                sent += 1
                if _limit_reached(limit, sent):
                    return
        if current.status != known_status or current.status in TERMINAL_STATUSES:
            known_status = current.status
            yield _sse("run", run_to_dict(current), event_id=event["seq"])
            sent += 1
            if _limit_reached(limit, sent):
                return


def run_to_dict(row: RunRow) -> dict[str, Any]:
    payload = asdict(row)
    payload["final_image_name"] = normalize_image_name(row.id, row.final_image_path)
    payload["final_image_url"] = build_image_url(row.id, row.final_image_path)
    return payload


def stage_to_dict(run_id: str, stage: StageRow) -> dict[str, Any]:
    payload = asdict(stage)
    image_names = _parse_image_paths(stage.image_paths)
    payload["image_names"] = image_names
    payload["image_urls"] = [build_image_url(run_id, name) for name in image_names]
    payload["payload"] = (
        runs_repo.load_stage_payload(run_id, stage.stage_name) if stage.payload_path else None
    )
    return payload


def battle_to_dict(run_id: str, battle: BattleRunRow) -> dict[str, Any]:
    payload = asdict(battle)
    payload["final_image_name"] = normalize_image_name(run_id, battle.final_image_path)
    payload["final_image_url"] = build_image_url(run_id, battle.final_image_path)
    return payload


def build_reuse_payload(row: RunRow) -> dict[str, Any]:
    return {
        "parent_run_id": row.id,
        "method_content": row.method_content,
        "caption": row.caption,
        "exp_mode": row.exp_mode,
        "main_model": row.main_model,
        "image_model": row.image_model,
        "retrieval_setting": row.retrieval_setting,
        "num_candidates": row.num_candidates,
        "aspect_ratio": row.aspect_ratio or "16:9",
        "figure_size": row.figure_size,
        "figure_language": row.figure_language,
        "max_critic_rounds": row.max_critic_rounds or 0,
    }


def run_dir(run_id: str) -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured) / run_id


def normalize_image_name(run_id: str, image_path: str | None) -> str | None:
    if not image_path:
        return None
    path = Path(image_path)
    parts = path.parts
    run_parts = (RUNS_PREFIX, run_id)
    if parts[:2] == run_parts:
        return Path(*parts[2:]).as_posix()
    return path.as_posix()


def build_image_url(run_id: str, image_path: str | None) -> str | None:
    name = normalize_image_name(run_id, image_path)
    if not name:
        return None
    return f"/api/runs/{run_id}/image/{name}"


def _resolve_image_path(run_id: str, name: str) -> str:
    base = run_dir(run_id).resolve()
    target = (base / name).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="image not found") from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="image not found")
    return str(target)


def _require_run(run_id: str) -> RunRow:
    row = runs_repo.get_run(run_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown run id: {run_id}")
    return row


def _find_stage(run_id: str, stage_name: str) -> StageRow | None:
    return next(
        (stage for stage in runs_repo.list_stages(run_id) if stage.stage_name == stage_name),
        None,
    )


def _parse_image_paths(image_paths: str | None) -> list[str]:
    if not image_paths:
        return []
    parsed = json.loads(image_paths)
    if not isinstance(parsed, list):
        raise TypeError("stage image_paths must decode to a list")
    return [str(item) for item in parsed]


def _sse(event: str, data: dict[str, Any], event_id: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "event": event,
        "retry": EVENT_RETRY_MS,
        "data": json.dumps(data, ensure_ascii=False),
    }
    if event_id is not None:
        payload["id"] = str(event_id)
    return payload


def _http_error(exc: ValueError) -> HTTPException:
    message = str(exc)
    status_code = 404 if message.startswith("unknown run id:") else 400
    return HTTPException(status_code=status_code, detail=message)


def _limit_reached(limit: int | None, sent: int) -> bool:
    return limit is not None and sent >= limit
