from __future__ import annotations

from contextlib import closing
from dataclasses import asdict, dataclass, field
from typing import Any
from uuid import uuid4

from server.db import connect, init_db


BATTLE_COLUMNS = (
    "id",
    "parent_run_id",
    "image_model",
    "status",
    "final_image_path",
    "error",
)
BATTLE_UPDATE_FIELDS = frozenset(BATTLE_COLUMNS) - {"id"}


@dataclass(frozen=True)
class BattleRunRow:
    parent_run_id: str
    image_model: str
    status: str
    id: str = field(default_factory=lambda: uuid4().hex)
    final_image_path: str | None = None
    error: str | None = None


def create_battle(row: BattleRunRow) -> str:
    init_db()
    values = asdict(row)
    columns_sql = ", ".join(BATTLE_COLUMNS)
    placeholders = ", ".join("?" for _ in BATTLE_COLUMNS)
    params = [values[column] for column in BATTLE_COLUMNS]
    with closing(connect()) as connection, connection:
        connection.execute(
            f"INSERT INTO battle_runs ({columns_sql}) VALUES ({placeholders})",
            params,
        )
    return row.id


def list_battles(parent_run_id: str) -> list[BattleRunRow]:
    init_db()
    columns_sql = ", ".join(BATTLE_COLUMNS)
    with closing(connect()) as connection:
        rows = connection.execute(
            f"SELECT {columns_sql} FROM battle_runs WHERE parent_run_id = ? ORDER BY id ASC",
            (parent_run_id,),
        ).fetchall()
    return [BattleRunRow(**dict(row)) for row in rows]


def update_battle(battle_id: str, **fields: Any) -> None:
    if not fields:
        return

    invalid_fields = sorted(set(fields) - BATTLE_UPDATE_FIELDS)
    if invalid_fields:
        raise ValueError(
            f"Unsupported fields for battle_runs: {', '.join(invalid_fields)}"
        )

    assignments = ", ".join(f"{column} = ?" for column in fields)
    params = [fields[column] for column in fields]
    params.append(battle_id)

    init_db()
    with closing(connect()) as connection, connection:
        connection.execute(
            f"UPDATE battle_runs SET {assignments} WHERE id = ?",
            params,
        )
