from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timezone
from math import sqrt
from typing import Any
from uuid import uuid4


EXAMPLE_COLUMNS = (
    "id",
    "discipline",
    "title_en",
    "title_zh",
    "method_content_en",
    "method_content_zh",
    "caption_en",
    "caption_zh",
    "suggested_aspect_ratio",
    "image_path",
    "priority",
    "created_at",
    "updated_at",
)
REQUIRED_FIELDS = (
    "discipline",
    "title_en",
    "title_zh",
    "method_content_en",
    "method_content_zh",
    "caption_en",
    "caption_zh",
)
UPDATE_FIELDS = frozenset(EXAMPLE_COLUMNS) - {"id", "created_at"}
PRIORITY_WEIGHTS = {1: 0.5, 2: 1.0, 3: 1.5}
TOKEN_RE = re.compile(r"[a-z0-9\u4e00-\u9fff]+")
DEFAULT_PRIORITY = 2
DEFAULT_TOP_K = 10


def list_examples(connection) -> list[dict[str, Any]]:
    columns_sql = ", ".join(EXAMPLE_COLUMNS)
    rows = connection.execute(
        f"SELECT {columns_sql} FROM examples ORDER BY priority DESC, created_at DESC"
    ).fetchall()
    return [dict(row) for row in rows]


def get_example(connection, id: str) -> dict[str, Any] | None:
    columns_sql = ", ".join(EXAMPLE_COLUMNS)
    row = connection.execute(
        f"SELECT {columns_sql} FROM examples WHERE id = ?",
        (id,),
    ).fetchone()
    return None if row is None else dict(row)


def create_example(connection, row: dict[str, Any]) -> dict[str, Any]:
    payload = _prepare_create_row(row)
    columns_sql = ", ".join(EXAMPLE_COLUMNS)
    placeholders = ", ".join("?" for _ in EXAMPLE_COLUMNS)
    params = [payload[column] for column in EXAMPLE_COLUMNS]
    connection.execute(
        f"INSERT INTO examples ({columns_sql}) VALUES ({placeholders})",
        params,
    )
    created = get_example(connection, str(payload["id"]))
    if created is None:
        raise RuntimeError("created example could not be loaded")
    return created


def update_example(connection, id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    current = get_example(connection, id)
    if current is None:
        return None
    if not patch:
        return current

    payload = _prepare_patch(patch)
    merged = {**current, **payload}
    _ensure_required_fields(merged)
    payload["updated_at"] = _now_iso()
    assignments = ", ".join(f"{column} = ?" for column in payload)
    params = [payload[column] for column in payload]
    params.append(id)
    connection.execute(f"UPDATE examples SET {assignments} WHERE id = ?", params)
    return get_example(connection, id)


def delete_example(connection, id: str) -> bool:
    cursor = connection.execute("DELETE FROM examples WHERE id = ?", (id,))
    return int(cursor.rowcount or 0) > 0


def set_image_path(connection, id: str, image_path: str | None) -> dict[str, Any] | None:
    return update_example(connection, id, {"image_path": image_path})


def search_examples(connection, query: str, top_k: int = DEFAULT_TOP_K) -> list[dict[str, Any]]:
    if top_k <= 0:
        return []
    rows = list_examples(connection)
    query_tokens = _token_counts(query)
    if not query_tokens:
        return [{**row, "score": 0.0} for row in rows[:top_k]]

    ranked = [{**row, "score": _rank_row(query_tokens, row)} for row in rows]
    ranked.sort(key=lambda row: (row["score"], row["created_at"]), reverse=True)
    return ranked[:top_k]


def _prepare_create_row(row: dict[str, Any]) -> dict[str, Any]:
    payload = {field: row.get(field) for field in EXAMPLE_COLUMNS}
    _ensure_required_fields(payload)
    priority = _validate_priority(row.get("priority", DEFAULT_PRIORITY))
    timestamp = _now_iso()
    payload["id"] = row.get("id") or _generate_id(str(payload["title_en"]))
    payload["image_path"] = row.get("image_path")
    payload["priority"] = priority
    payload["created_at"] = timestamp
    payload["updated_at"] = timestamp
    return payload


def _prepare_patch(patch: dict[str, Any]) -> dict[str, Any]:
    invalid_fields = sorted(set(patch) - UPDATE_FIELDS)
    if invalid_fields:
        raise ValueError(f"Unsupported example fields: {', '.join(invalid_fields)}")

    payload = dict(patch)
    if "priority" in payload:
        payload["priority"] = _validate_priority(payload["priority"])
    return payload


def _ensure_required_fields(payload: dict[str, Any]) -> None:
    missing = [field for field in REQUIRED_FIELDS if not str(payload.get(field) or "").strip()]
    if missing:
        raise ValueError(f"Missing required field: {missing[0]}")


def _validate_priority(priority: Any) -> int:
    value = int(priority)
    if value not in PRIORITY_WEIGHTS:
        raise ValueError("priority must be one of 1, 2, 3")
    return value


def _rank_row(query_tokens: Counter[str], row: dict[str, Any]) -> float:
    row_tokens = _token_counts(_search_blob(row))
    similarity = _cosine_similarity(query_tokens, row_tokens)
    return similarity * PRIORITY_WEIGHTS[int(row["priority"])]


def _search_blob(row: dict[str, Any]) -> str:
    return " ".join(str(row.get(field) or "") for field in REQUIRED_FIELDS[:2]) + " " + " ".join(
        str(row.get(field) or "") for field in REQUIRED_FIELDS[2:]
    )


def _token_counts(text: str) -> Counter[str]:
    return Counter(TOKEN_RE.findall(text.lower()))


def _cosine_similarity(query_tokens: Counter[str], row_tokens: Counter[str]) -> float:
    if not query_tokens or not row_tokens:
        return 0.0
    dot_product = sum(count * row_tokens.get(token, 0) for token, count in query_tokens.items())
    query_norm = sqrt(sum(count * count for count in query_tokens.values()))
    row_norm = sqrt(sum(count * count for count in row_tokens.values()))
    if query_norm == 0.0 or row_norm == 0.0:
        return 0.0
    return dot_product / (query_norm * row_norm)


def _generate_id(title_en: str) -> str:
    slug = "-".join(TOKEN_RE.findall(title_en.lower())) or "example"
    return f"{slug}-{uuid4().hex[:6]}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
