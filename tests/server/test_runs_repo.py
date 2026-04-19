from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

import server.settings as settings
from server.db import connect, init_db
from server.repos.battle_repo import BattleRunRow, create_battle, list_battles, update_battle
from server.repos.runs_repo import (
    RunRow,
    StageRow,
    create_run,
    delete_run,
    get_run,
    insert_stage,
    list_runs,
    list_stages,
    load_stage_payload,
    update_run,
    update_stage,
)


@pytest.fixture()
def isolated_results(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    results_dir = tmp_path / "results"
    monkeypatch.setattr(
        settings,
        "db_path",
        lambda: results_dir / "paperbanana.db",
        raising=False,
    )
    monkeypatch.setattr(settings, "RUNS_DIR", results_dir / "runs")
    return results_dir


def test_init_db_is_idempotent(isolated_results: Path) -> None:
    init_db()
    init_db()

    connection = connect()
    try:
        table_names = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
    finally:
        connection.close()

    assert {"runs", "run_stages", "battle_runs"} <= table_names


def test_create_run_and_get_run_roundtrip_all_fields(isolated_results: Path) -> None:
    row = _build_run(
        planner_prompt="planner output",
        visualizer_prompt="visualizer output",
        parent_run_id="parent-123",
        completed_at="2026-04-19T08:41:00",
        last_stage="visualizer",
        error="no error",
        final_image_path="runs/run-1/final/candidate_0.png",
    )

    run_id = create_run(row)
    stored = get_run(run_id)

    assert run_id == row.id
    assert stored == row


def test_list_runs_orders_by_created_at_and_applies_window(isolated_results: Path) -> None:
    oldest = _build_run(created_at="2026-04-19T08:00:00", updated_at="2026-04-19T08:00:00")
    middle = _build_run(
        created_at="2026-04-19T09:00:00",
        updated_at="2026-04-19T09:00:00",
        kind="battle",
    )
    newest = _build_run(created_at="2026-04-19T10:00:00", updated_at="2026-04-19T10:00:00")

    create_run(oldest)
    create_run(middle)
    create_run(newest)

    window = list_runs(limit=2, offset=1)
    battle_only = list_runs(kind="battle")

    assert [row.id for row in window] == [middle.id, oldest.id]
    assert [row.id for row in battle_only] == [middle.id]


def test_update_run_and_delete_run_cascades_stages(isolated_results: Path) -> None:
    run = _build_run()
    run_id = create_run(run)
    stage_id = insert_stage(run_id, StageRow(stage_name="planner", status="running"))

    update_run(run_id, status="succeeded", last_stage="planner")
    update_stage(stage_id, status="succeeded", payload_path="stages/planner.json")

    updated_run = get_run(run_id)
    updated_stage = list_stages(run_id)[0]

    assert updated_run is not None
    assert updated_run.status == "succeeded"
    assert updated_run.last_stage == "planner"
    assert updated_stage.status == "succeeded"
    assert updated_stage.payload_path == "stages/planner.json"

    delete_run(run_id)

    assert get_run(run_id) is None
    assert list_stages(run_id) == []


def test_insert_stage_rejects_duplicate_stage_name(isolated_results: Path) -> None:
    run_id = create_run(_build_run())
    stage = StageRow(stage_name="planner", status="pending")

    insert_stage(run_id, stage)

    with pytest.raises(sqlite3.IntegrityError):
        insert_stage(run_id, stage)


def test_load_stage_payload_reads_stage_json_and_missing_file_is_clear(
    isolated_results: Path,
) -> None:
    run_id = create_run(_build_run())
    stage_payload = {"prompt": "draw", "images": ["candidate_0.png"]}
    payload_path = isolated_results / "runs" / run_id / "stages" / "planner.json"
    payload_path.parent.mkdir(parents=True, exist_ok=True)
    payload_path.write_text(json.dumps(stage_payload), encoding="utf-8")

    assert load_stage_payload(run_id, "planner") == stage_payload

    with pytest.raises(FileNotFoundError, match="missing\\.json"):
        load_stage_payload(run_id, "missing")


def test_battle_repo_create_list_and_update(isolated_results: Path) -> None:
    parent_run_id = create_run(_build_run())
    battle = BattleRunRow(
        parent_run_id=parent_run_id,
        image_model="provider::battle-model",
        status="running",
    )

    battle_id = create_battle(battle)
    update_battle(battle_id, status="succeeded", final_image_path="runs/final.png")
    stored = list_battles(parent_run_id)

    assert battle_id == battle.id
    assert stored == [
        BattleRunRow(
            id=battle.id,
            parent_run_id=parent_run_id,
            image_model="provider::battle-model",
            status="succeeded",
            final_image_path="runs/final.png",
            error=None,
        )
    ]


def _build_run(**overrides: object) -> RunRow:
    base = {
        "kind": "generate",
        "status": "queued",
        "exp_mode": "demo_full",
        "retrieval_setting": "top_k",
        "num_candidates": 2,
        "main_model": "provider::main-model",
        "image_model": "provider::image-model",
        "method_content": "Method section",
        "caption": "Figure caption",
        "created_at": "2026-04-19T08:30:00",
        "updated_at": "2026-04-19T08:30:00",
        "aspect_ratio": "16:9",
        "figure_size": "single-column",
        "figure_language": "en",
        "max_critic_rounds": 2,
        "planner_prompt": "plan",
        "visualizer_prompt": "viz",
        "final_image_path": None,
        "completed_at": None,
        "last_stage": None,
        "error": None,
        "parent_run_id": None,
    }
    base.update(overrides)
    return RunRow(**base)
