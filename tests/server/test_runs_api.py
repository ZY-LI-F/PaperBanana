from __future__ import annotations

import asyncio
import json
from time import monotonic

import pytest

from server.repos import runs_repo
from server.services.log_bus import log_bus


WAIT_SECONDS = 3.0
WAIT_INTERVAL_SECONDS = 0.01


@pytest.mark.anyio
async def test_create_run_detail_and_image(api_client, fake_processor) -> None:
    response = await api_client.post(
        "/api/runs",
        json={
            "method_content": "Method section",
            "caption": "Figure caption",
            "exp_mode": "demo_full",
            "main_model": "provider::main-model",
            "image_model": "provider::image-model",
            "max_critic_rounds": 1,
        },
    )

    assert response.status_code == 200
    run_id = response.json()["run_id"]
    await _wait_for_run(run_id, "succeeded")

    detail = await api_client.get(f"/api/runs/{run_id}")
    assert detail.status_code == 200
    body = detail.json()

    assert body["id"] == run_id
    assert body["final_image_url"] == f"/api/runs/{run_id}/image/final/candidate_0.png"
    assert body["stages"][0]["payload"]["top10_references"] == ["ref_1", "ref_2"]
    assert body["reuse"]["method_content"] == "Method section"

    image_response = await api_client.get(body["final_image_url"])
    assert image_response.status_code == 200
    assert image_response.headers["content-type"] == "image/png"
    assert image_response.content.startswith(b"\x89PNG\r\n\x1a\n")


@pytest.mark.anyio
async def test_cancel_and_resume_run(api_client, fake_processor) -> None:
    fake_processor.delays["planner"] = 0.2
    create = await api_client.post(
        "/api/runs",
        json={
            "method_content": "Method section",
            "caption": "Figure caption",
            "exp_mode": "demo_full",
            "main_model": "provider::main-model",
            "image_model": "provider::image-model",
            "max_critic_rounds": 1,
        },
    )
    run_id = create.json()["run_id"]

    await _wait_for_stage(run_id, "planner")
    cancel = await api_client.post(f"/api/runs/{run_id}/cancel")
    assert cancel.status_code == 204

    source_row = await _wait_for_run(run_id, "paused")
    assert source_row.last_stage in {"retriever", "planner"}

    resume = await api_client.post(f"/api/runs/{run_id}/resume")
    assert resume.status_code == 200
    resumed_run_id = resume.json()["run_id"]

    resumed_row = await _wait_for_run(resumed_run_id, "succeeded")
    assert resumed_row.parent_run_id == run_id


@pytest.mark.anyio
async def test_run_events_streams_stage_and_log_events(api_client, fake_processor) -> None:
    fake_processor.delays["planner"] = 0.2
    create = await api_client.post(
        "/api/runs",
        json={
            "method_content": "Method section",
            "caption": "Figure caption",
            "exp_mode": "demo_full",
            "main_model": "provider::main-model",
            "image_model": "provider::image-model",
            "max_critic_rounds": 1,
        },
    )
    run_id = create.json()["run_id"]
    await _wait_for_stage(run_id, "planner")

    request_task = asyncio.create_task(
        api_client.get(f"/api/runs/{run_id}/events", params={"limit": 4})
    )
    publisher = asyncio.create_task(_publish_later(run_id, "manual log", "planner"))
    response = await asyncio.wait_for(request_task, 1.0)
    await publisher

    assert response.status_code == 200
    events = _parse_sse_events(response.text)
    stage_event = next(
        event
        for event in events
        if event["event"] == "stage" and event["data"].get("stage_name") == "planner"
    )
    log_event = next(
        event
        for event in events
        if event["event"] == "log" and event["data"].get("msg") == "manual log"
    )
    assert stage_event["data"]["stage_name"] == "planner"
    assert log_event["data"]["msg"] == "manual log"
    await _wait_for_terminal(run_id)


async def _publish_later(run_id: str, msg: str, stage: str) -> None:
    await asyncio.sleep(0.05)
    log_bus.publish(run_id, "info", msg, stage=stage)


async def _wait_for_run(run_id: str, status: str):
    deadline = monotonic() + WAIT_SECONDS
    while monotonic() < deadline:
        row = runs_repo.get_run(run_id)
        if row is not None and row.status == status:
            return row
        await asyncio.sleep(WAIT_INTERVAL_SECONDS)
    raise AssertionError(f"run {run_id} did not reach {status}")


async def _wait_for_stage(run_id: str, stage_name: str) -> None:
    deadline = monotonic() + WAIT_SECONDS
    while monotonic() < deadline:
        if any(stage.stage_name == stage_name for stage in runs_repo.list_stages(run_id)):
            return
        await asyncio.sleep(WAIT_INTERVAL_SECONDS)
    raise AssertionError(f"stage {stage_name} did not appear for {run_id}")


async def _wait_for_terminal(run_id: str) -> None:
    deadline = monotonic() + WAIT_SECONDS
    while monotonic() < deadline:
        row = runs_repo.get_run(run_id)
        if row is not None and row.status in {"succeeded", "failed", "cancelled", "paused"}:
            return
        await asyncio.sleep(WAIT_INTERVAL_SECONDS)
    raise AssertionError(f"run {run_id} did not finish before timeout")


def _parse_sse_events(body: str) -> list[dict]:
    events: list[dict] = []
    event_name: str | None = None
    data_lines: list[str] = []
    for line in body.splitlines():
        if not line:
            if event_name and data_lines:
                events.append(
                    {"event": event_name, "data": json.loads("\n".join(data_lines))}
                )
            event_name = None
            data_lines = []
            continue
        if line.startswith("event:"):
            event_name = line.split(":", 1)[1].strip()
        if line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())
    return events
