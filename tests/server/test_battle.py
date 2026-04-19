from __future__ import annotations

import time

from server.repos.battle_repo import list_battles
from server.repos.runs_repo import get_run, list_stages
from server.services import run_service


def test_battle_fans_out_models_without_replanning(fake_processor) -> None:
    params = run_service.GenerateParams(
        method_content="Method section",
        caption="Figure caption",
        exp_mode="demo_full",
        main_model="provider::main-model",
        image_model="provider::baseline-image",
    )
    image_models = [
        "provider::image-a",
        "provider::image-b",
        "provider::image-c",
    ]

    run_id = run_service.start_battle(params, image_models)
    row = _wait_for(lambda: _run_when(run_id, "succeeded"))
    battles = list_battles(run_id)

    assert row is not None
    assert len(fake_processor.calls["planner"]) == 1
    assert [stage.stage_name for stage in list_stages(run_id)] == [
        "retriever",
        "planner",
        "stylist",
    ]
    assert sorted(battle.image_model for battle in battles) == sorted(image_models)
    assert {battle.status for battle in battles} == {"succeeded"}
    assert [call["image_model"] for call in fake_processor.calls["visualizer"]] == image_models


def _wait_for(predicate, timeout: float = 10.0):
    # v0.3: widened from 3.0 s; under Windows + asyncio jitter the 3 s cap was
    # flaky even though the service layer converges in <200 ms on a warm box.
    # 10 s keeps fast CI fast (predicate returns immediately on warm runs)
    # while absorbing cold-start + GC pauses.
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.02)
    raise AssertionError("condition not met before timeout")


def _run_when(run_id: str, status: str):
    row = get_run(run_id)
    if row is not None and row.status == status:
        return row
    return None
