from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from time import monotonic

import pytest

from server.repos import runs_repo
from server.repos.runs_repo import RunRow
from server.services.log_bus import log_bus


@pytest.mark.anyio
async def test_global_logs_sse_emits_published_line_within_500ms(api_client, fake_processor) -> None:
    del fake_processor
    timestamp = datetime.now(timezone.utc).isoformat()
    run_id = runs_repo.create_run(
        RunRow(
            kind="generate",
            status="queued",
            exp_mode="demo_full",
            retrieval_setting="auto",
            num_candidates=1,
            main_model="provider::main-model",
            image_model="provider::image-model",
            method_content="Method section",
            caption="Figure caption",
            created_at=timestamp,
            updated_at=timestamp,
        )
    )

    start = monotonic()
    request_task = asyncio.create_task(
        api_client.get("/api/logs/events", params={"run_id": run_id, "limit": 1})
    )
    publisher = asyncio.create_task(_publish_later(run_id))
    response = await asyncio.wait_for(request_task, 0.5)
    elapsed = monotonic() - start
    await publisher

    assert response.status_code == 200
    event = _parse_log_event(response.text)
    assert event["run_id"] == run_id
    assert event["msg"] == "appended line"
    assert elapsed < 0.5


async def _publish_later(run_id: str) -> None:
    await asyncio.sleep(0.05)
    log_bus.publish(run_id, "info", "appended line")


def _parse_log_event(body: str) -> dict:
    for block in body.strip().split("\n\n"):
        lines = block.splitlines()
        event_name = next(
            (line.split(":", 1)[1].strip() for line in lines if line.startswith("event:")),
            None,
        )
        data = next(
            (line.split(":", 1)[1].strip() for line in lines if line.startswith("data:")),
            None,
        )
        if event_name == "log" and data:
            return json.loads(data)
    raise AssertionError("stream ended before target log arrived")
