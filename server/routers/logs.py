from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from server.repos import runs_repo
from server.services.log_bus import log_bus


EVENT_RETRY_MS = 5_000

router = APIRouter(prefix="/api", tags=["logs"])


@router.get("/logs/events")
async def log_events(
    run_id: str | None = None,
    limit: int | None = Query(None, ge=1),
) -> EventSourceResponse:
    if run_id and runs_repo.get_run(run_id) is None:
        raise HTTPException(status_code=404, detail=f"unknown run id: {run_id}")
    return EventSourceResponse(_log_stream(run_id, limit))


async def _log_stream(run_id: str | None, limit: int | None):
    sent = 0
    async for event in log_bus.subscribe(run_id):
        yield _sse("log", event, event_id=event["seq"])
        sent += 1
        if limit is not None and sent >= limit:
            return


def _sse(event: str, data: dict[str, Any], event_id: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "event": event,
        "retry": EVENT_RETRY_MS,
        "data": json.dumps(data, ensure_ascii=False),
    }
    if event_id is not None:
        payload["id"] = str(event_id)
    return payload
