from __future__ import annotations

import json
import time
from pathlib import Path

from server.repos.runs_repo import get_run, list_stages, load_stage_payload
from server.services import run_service


def test_generate_run_persists_stage_payloads_and_final_image(
    fake_processor,
    isolated_results: Path,
) -> None:
    params = run_service.GenerateParams(
        method_content="Method section",
        caption="Figure caption",
        exp_mode="demo_full",
        main_model="provider::main-model",
        image_model="provider::image-model",
        retrieval_setting="auto",
        figure_size="single-column",
        figure_language="en",
        max_critic_rounds=1,
    )

    run_id = run_service.start_generate(params)
    row = _wait_for(lambda: _run_when(run_id, "succeeded"))
    stages = list_stages(run_id)
    visualizer_payload = load_stage_payload(run_id, "visualizer")
    raw_payload = json.loads(
        (isolated_results / "runs" / run_id / "stages" / "visualizer.json").read_text(
            encoding="utf-8"
        )
    )

    assert row is not None
    assert row.planner_prompt == "planner prompt"
    assert row.visualizer_prompt == "stylist prompt"
    assert row.main_model == "provider::main-model"
    assert row.image_model == "provider::image-model"
    assert row.final_image_path is not None
    assert [stage.stage_name for stage in stages] == [
        "retriever",
        "planner",
        "stylist",
        "visualizer",
        "critic_0",
    ]
    assert {stage.status for stage in stages} == {"succeeded"}
    assert visualizer_payload == raw_payload
    assert visualizer_payload["target_diagram_stylist_desc0_base64_jpg"] == {
        "$ref": "stages/visualizer/candidate_0.png"
    }
    assert (isolated_results / "runs" / run_id / "stages" / "visualizer" / "candidate_0.png").is_file()
    assert (isolated_results / row.final_image_path).is_file()


def test_cancel_marks_run_paused_and_stops_before_next_stage(
    fake_processor,
) -> None:
    fake_processor.delays["planner"] = 0.2
    params = run_service.GenerateParams(
        method_content="Method section",
        caption="Figure caption",
        exp_mode="dev_planner_stylist",
        main_model="provider::main-model",
        image_model="provider::image-model",
    )

    run_id = run_service.start_generate(params)
    _wait_for(lambda: _stage_started(run_id, "planner"))
    run_service.cancel(run_id)
    row = _wait_for(lambda: _run_when(run_id, "paused", last_stage="planner"))

    assert row is not None
    assert row.last_stage == "planner"
    assert [stage.stage_name for stage in list_stages(run_id)] == ["retriever", "planner"]


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
