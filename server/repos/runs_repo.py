from __future__ import annotations

import json
from contextlib import closing
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

import server.settings as settings
from server.db import connect, init_db


RUN_COLUMNS = (
    "id",
    "kind",
    "status",
    "exp_mode",
    "retrieval_setting",
    "num_candidates",
    "aspect_ratio",
    "figure_size",
    "figure_language",
    "max_critic_rounds",
    "main_model",
    "image_model",
    "method_content",
    "caption",
    "planner_prompt",
    "visualizer_prompt",
    "final_image_path",
    "created_at",
    "updated_at",
    "completed_at",
    "last_stage",
    "error",
    "parent_run_id",
)
STAGE_COLUMNS = (
    "id",
    "run_id",
    "stage_name",
    "status",
    "started_at",
    "finished_at",
    "payload_path",
    "image_paths",
    "error",
)
RUN_UPDATE_FIELDS = frozenset(RUN_COLUMNS) - {"id"}
STAGE_UPDATE_FIELDS = frozenset(STAGE_COLUMNS) - {"id", "run_id"}


@dataclass(frozen=True)
class RunRow:
    kind: str
    status: str
    exp_mode: str
    retrieval_setting: str
    num_candidates: int
    main_model: str
    image_model: str
    method_content: str
    caption: str
    created_at: str
    updated_at: str
    id: str = field(default_factory=lambda: uuid4().hex)
    aspect_ratio: str | None = None
    figure_size: str | None = None
    figure_language: str | None = None
    max_critic_rounds: int | None = None
    planner_prompt: str | None = None
    visualizer_prompt: str | None = None
    final_image_path: str | None = None
    completed_at: str | None = None
    last_stage: str | None = None
    error: str | None = None
    parent_run_id: str | None = None


@dataclass(frozen=True)
class StageRow:
    stage_name: str
    status: str
    run_id: str = ""
    id: int | None = None
    started_at: str | None = None
    finished_at: str | None = None
    payload_path: str | None = None
    image_paths: str | None = None
    error: str | None = None


def create_run(row: RunRow) -> str:
    init_db()
    values = asdict(row)
    columns_sql = ", ".join(RUN_COLUMNS)
    placeholders = ", ".join("?" for _ in RUN_COLUMNS)
    params = [values[column] for column in RUN_COLUMNS]
    with closing(connect()) as connection, connection:
        connection.execute(
            f"INSERT INTO runs ({columns_sql}) VALUES ({placeholders})",
            params,
        )
    return row.id


def get_run(run_id: str) -> RunRow | None:
    init_db()
    columns_sql = ", ".join(RUN_COLUMNS)
    with closing(connect()) as connection:
        row = connection.execute(
            f"SELECT {columns_sql} FROM runs WHERE id = ?",
            (run_id,),
        ).fetchone()
    return None if row is None else RunRow(**dict(row))


def list_runs(limit: int = 50, offset: int = 0, kind: str | None = None) -> list[RunRow]:
    _ensure_page_args(limit=limit, offset=offset)
    init_db()

    params: list[Any] = []
    where_sql = ""
    if kind is not None:
        where_sql = " WHERE kind = ?"
        params.append(kind)

    params.extend([limit, offset])
    columns_sql = ", ".join(RUN_COLUMNS)
    sql = (
        f"SELECT {columns_sql} FROM runs{where_sql} "
        "ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    with closing(connect()) as connection:
        rows = connection.execute(sql, params).fetchall()
    return [RunRow(**dict(row)) for row in rows]


def update_run(run_id: str, **fields: Any) -> None:
    _update_record("runs", "id", run_id, RUN_UPDATE_FIELDS, fields)


def delete_run(run_id: str) -> None:
    init_db()
    with closing(connect()) as connection, connection:
        connection.execute("DELETE FROM runs WHERE id = ?", (run_id,))


def insert_stage(run_id: str, stage: StageRow) -> int:
    init_db()
    values = asdict(stage)
    values["run_id"] = run_id
    columns = [column for column in STAGE_COLUMNS if column != "id"]
    columns_sql = ", ".join(columns)
    placeholders = ", ".join("?" for _ in columns)
    params = [values[column] for column in columns]
    with closing(connect()) as connection, connection:
        cursor = connection.execute(
            f"INSERT INTO run_stages ({columns_sql}) VALUES ({placeholders})",
            params,
        )
    return int(cursor.lastrowid)


def upsert_stage(run_id: str, stage: StageRow) -> int:
    """Insert or update a stage row keyed on (run_id, stage_name).

    Unlike :func:`insert_stage`, this is idempotent for the resume path:
    stages recorded during a cancelled run can be re-asserted without
    violating the UNIQUE(run_id, stage_name) constraint.
    """
    init_db()
    values = asdict(stage)
    values["run_id"] = run_id
    columns = [column for column in STAGE_COLUMNS if column != "id"]
    columns_sql = ", ".join(columns)
    placeholders = ", ".join("?" for _ in columns)
    update_assignments = ", ".join(
        f"{col}=excluded.{col}" for col in columns if col not in ("run_id", "stage_name")
    )
    params = [values[column] for column in columns]
    with closing(connect()) as connection, connection:
        cursor = connection.execute(
            f"INSERT INTO run_stages ({columns_sql}) VALUES ({placeholders}) "
            f"ON CONFLICT(run_id, stage_name) DO UPDATE SET {update_assignments}",
            params,
        )
    return int(cursor.lastrowid)


def list_stages(run_id: str) -> list[StageRow]:
    init_db()
    columns_sql = ", ".join(STAGE_COLUMNS)
    with closing(connect()) as connection:
        rows = connection.execute(
            f"SELECT {columns_sql} FROM run_stages WHERE run_id = ? ORDER BY id ASC",
            (run_id,),
        ).fetchall()
    return [StageRow(**dict(row)) for row in rows]


def update_stage(stage_id: int, **fields: Any) -> None:
    _update_record("run_stages", "id", stage_id, STAGE_UPDATE_FIELDS, fields)


def load_stage_payload(run_id: str, stage_name: str) -> dict:
    payload_path = _runs_dir() / run_id / "stages" / f"{stage_name}.json"
    if not payload_path.is_file():
        raise FileNotFoundError(f"Stage payload not found: {payload_path}")

    with payload_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise TypeError(f"Stage payload must be a JSON object: {payload_path}")
    return payload


def _ensure_page_args(*, limit: int, offset: int) -> None:
    if limit < 0 or offset < 0:
        raise ValueError("limit and offset must be non-negative")


def _runs_dir() -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured)


def _update_record(
    table: str,
    key_column: str,
    key_value: str | int,
    allowed_fields: frozenset[str],
    fields: dict[str, Any],
) -> None:
    if not fields:
        return

    invalid_fields = sorted(set(fields) - allowed_fields)
    if invalid_fields:
        raise ValueError(f"Unsupported fields for {table}: {', '.join(invalid_fields)}")

    assignments = ", ".join(f"{column} = ?" for column in fields)
    params = [fields[column] for column in fields]
    params.append(key_value)

    init_db()
    with closing(connect()) as connection, connection:
        connection.execute(
            f"UPDATE {table} SET {assignments} WHERE {key_column} = ?",
            params,
        )
