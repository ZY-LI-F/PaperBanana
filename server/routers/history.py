from __future__ import annotations

import shutil
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from server.db import connect, init_db
from server.repos import runs_repo
from server.routers.runs import run_dir, run_to_dict


DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
QUERY_FIELDS = (
    "id",
    "caption",
    "method_content",
    "planner_prompt",
    "visualizer_prompt",
)

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/runs")
async def list_history(
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    kind: str | None = None,
    status: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    items, total = _load_runs(limit=limit, offset=offset, kind=kind, status=status, query=q)
    return {
        "items": [run_to_dict(row) for row in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.delete("/runs/{run_id}", status_code=204)
async def delete_history_run(run_id: str) -> Response:
    row = runs_repo.get_run(run_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown run id: {run_id}")

    init_db()
    with connect() as connection, connection:
        connection.execute("DELETE FROM battle_runs WHERE parent_run_id = ?", (run_id,))
    runs_repo.delete_run(run_id)

    path = run_dir(run_id)
    if path.exists():
        shutil.rmtree(path)
    return Response(status_code=204)


def _load_runs(
    *,
    limit: int,
    offset: int,
    kind: str | None,
    status: str | None,
    query: str | None,
) -> tuple[list[runs_repo.RunRow], int]:
    where_parts: list[str] = []
    params: list[Any] = []

    if kind:
        where_parts.append("kind = ?")
        params.append(kind)
    if status:
        where_parts.append("status = ?")
        params.append(status)
    if query:
        pattern = f"%{query}%"
        fields_sql = " OR ".join(f"COALESCE({field}, '') LIKE ?" for field in QUERY_FIELDS)
        where_parts.append(f"({fields_sql})")
        params.extend(pattern for _ in QUERY_FIELDS)

    where_sql = f" WHERE {' AND '.join(where_parts)}" if where_parts else ""
    columns_sql = ", ".join(runs_repo.RUN_COLUMNS)
    page_params = [*params, limit, offset]

    init_db()
    with connect() as connection:
        total = connection.execute(f"SELECT COUNT(*) FROM runs{where_sql}", params).fetchone()[0]
        rows = connection.execute(
            (
                f"SELECT {columns_sql} FROM runs{where_sql} "
                "ORDER BY created_at DESC LIMIT ? OFFSET ?"
            ),
            page_params,
        ).fetchall()
    return [runs_repo.RunRow(**dict(row)) for row in rows], int(total)
