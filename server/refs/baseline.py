from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

import server.settings as settings


TaskName = Literal["diagram", "plot"]


@lru_cache(maxsize=2)
def load_baseline(task: TaskName) -> dict[str, dict]:
    baseline_path = Path(settings.BASELINE_DIR) / task / "ref.json"
    if not baseline_path.is_file():
        return {}
    rows = json.loads(baseline_path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError(f"baseline ref.json must be a list: {baseline_path}")
    return _index_rows(rows)


def _index_rows(rows: list[dict]) -> dict[str, dict]:
    indexed: dict[str, dict] = {}
    for row in rows:
        row_id = str(row.get("id") or "").strip()
        if not row_id:
            continue
        indexed[row_id] = {**row, "_baseline": True}
    return indexed
