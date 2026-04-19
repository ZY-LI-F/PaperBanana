from __future__ import annotations

import asyncio
from time import monotonic

import pytest

from server.repos import runs_repo
from server.routers.runs import run_dir
from server.services import run_service


WAIT_SECONDS = 3.0
WAIT_INTERVAL_SECONDS = 0.01


@pytest.mark.anyio
async def test_list_history_filters_and_paginates(api_client, fake_processor) -> None:
    alpha = run_service.start_generate(
        run_service.GenerateParams(
            method_content="Alpha method",
            caption="Alpha caption",
            exp_mode="demo_full",
            main_model="provider::main-model",
            image_model="provider::image-model",
            max_critic_rounds=1,
        )
    )
    beta = run_service.start_generate(
        run_service.GenerateParams(
            method_content="Beta method",
            caption="Beta caption",
            exp_mode="demo_full",
            main_model="provider::main-model",
            image_model="provider::image-model",
            max_critic_rounds=1,
        )
    )
    await _wait_for_run(alpha, "succeeded")
    await _wait_for_run(beta, "succeeded")

    response = await api_client.get("/api/runs", params={"q": "Beta", "status": "succeeded", "limit": 1})
    assert response.status_code == 200
    body = response.json()

    assert body["total"] == 1
    assert body["limit"] == 1
    assert [item["id"] for item in body["items"]] == [beta]


@pytest.mark.anyio
async def test_reuse_payload_and_delete_cascade(api_client, fake_processor) -> None:
    run_id = run_service.start_generate(
        run_service.GenerateParams(
            method_content="Method section",
            caption="Reusable caption",
            exp_mode="demo_full",
            main_model="provider::main-model",
            image_model="provider::image-model",
            max_critic_rounds=1,
        )
    )
    await _wait_for_run(run_id, "succeeded")

    detail = await api_client.get(f"/api/runs/{run_id}")
    assert detail.status_code == 200
    body = detail.json()

    assert body["reuse"] == {
        "parent_run_id": run_id,
        "method_content": "Method section",
        "caption": "Reusable caption",
        "exp_mode": "demo_full",
        "main_model": "provider::main-model",
        "image_model": "provider::image-model",
        "retrieval_setting": "auto",
        "num_candidates": 1,
        "aspect_ratio": "16:9",
        "figure_size": None,
        "figure_language": None,
        "max_critic_rounds": 1,
    }
    assert body["stages"][1]["payload"]["target_diagram_desc0"] == "planner prompt"

    delete = await api_client.delete(f"/api/runs/{run_id}")
    assert delete.status_code == 204
    assert runs_repo.get_run(run_id) is None
    assert not run_dir(run_id).exists()


async def _wait_for_run(run_id: str, status: str):
    deadline = monotonic() + WAIT_SECONDS
    while monotonic() < deadline:
        row = runs_repo.get_run(run_id)
        if row is not None and row.status == status:
            return row
        await asyncio.sleep(WAIT_INTERVAL_SECONDS)
    raise AssertionError(f"run {run_id} did not reach {status}")
