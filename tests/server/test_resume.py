from __future__ import annotations

import time

from server.repos.runs_repo import get_run, list_stages, load_stage_payload
from server.services import run_service


def test_resume_reuses_planner_snapshot_without_reinvoking_planner(fake_processor) -> None:
    fake_processor.delays["planner"] = 0.2
    params = run_service.GenerateParams(
        method_content="Method section",
        caption="Figure caption",
        exp_mode="demo_full",
        main_model="provider::main-model",
        image_model="provider::image-model",
        max_critic_rounds=1,
    )

    source_run_id = run_service.start_generate(params)
    _wait_for(lambda: _stage_started(source_run_id, "planner"))
    run_service.cancel(source_run_id)
    source_row = _wait_for(
        lambda: _run_when(source_run_id, "paused", last_stage="planner")
    )
    fake_processor.delays["planner"] = 0.0

    resumed_run_id = run_service.resume(source_run_id)
    resumed_row = _wait_for(lambda: _run_when(resumed_run_id, "succeeded"))

    assert source_row is not None
    assert source_row.last_stage == "planner"
    assert resumed_row is not None
    assert resumed_row.parent_run_id == source_run_id
    assert len(fake_processor.calls["planner"]) == 1
    assert [stage.stage_name for stage in list_stages(resumed_run_id)] == [
        "retriever",
        "planner",
        "stylist",
        "visualizer",
        "critic_0",
    ]
    assert load_stage_payload(resumed_run_id, "planner") == load_stage_payload(
        source_run_id,
        "planner",
    )


def _wait_for(predicate, timeout: float = 3.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.02)
    raise AssertionError("condition not met before timeout")


def _run_when(run_id: str, status: str, last_stage: str | None = None):
    row = get_run(run_id)
    if row is not None and row.status == status and (
        last_stage is None or row.last_stage == last_stage
    ):
        return row
    return None


def _stage_started(run_id: str, stage_name: str) -> bool:
    return any(stage.stage_name == stage_name for stage in list_stages(run_id))
