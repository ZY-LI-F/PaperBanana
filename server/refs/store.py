from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


TASKS = frozenset({"diagram", "plot"})
OVERRIDE_ACTIONS = frozenset({"patch", "create", "delete"})
IMAGE_ROLES = frozenset({"main", "variant"})
OVERRIDE_COLUMNS = (
    "task",
    "id",
    "action",
    "content",
    "visual_intent",
    "category",
    "additional_info",
    "primary_image_key",
    "created_at",
    "updated_at",
)
OVERRIDE_FIELDS = frozenset(
    {"content", "visual_intent", "category", "additional_info", "primary_image_key"}
)
IMAGE_COLUMNS = (
    "key",
    "task",
    "ref_id",
    "role",
    "style",
    "file_path",
    "order_index",
    "created_at",
)
IMAGE_FIELDS = frozenset({"task", "ref_id", "role", "style", "file_path", "order_index"})


def get_override(conn, task: str, id: str) -> dict[str, Any] | None:
    _validate_task(task)
    row = conn.execute(
        f"SELECT {', '.join(OVERRIDE_COLUMNS)} FROM ref_overrides WHERE task = ? AND id = ?",
        (task, id),
    ).fetchone()
    return _decode_override(row)


def list_overrides(conn, task: str) -> list[dict[str, Any]]:
    _validate_task(task)
    rows = conn.execute(
        f"SELECT {', '.join(OVERRIDE_COLUMNS)} FROM ref_overrides WHERE task = ?",
        (task,),
    ).fetchall()
    return [_decode_override(row) for row in rows if row is not None]


def upsert_override(
    conn,
    task: str,
    id: str,
    action: str,
    fields: dict[str, Any],
) -> dict[str, Any]:
    _validate_task(task)
    _validate_override_action(action)
    current = get_override(conn, task, id)
    payload = _build_override_payload(task, id, action, fields, current)
    columns_sql = ", ".join(OVERRIDE_COLUMNS)
    placeholders = ", ".join("?" for _ in OVERRIDE_COLUMNS)
    assignments = ", ".join(f"{column} = excluded.{column}" for column in OVERRIDE_COLUMNS[2:])
    conn.execute(
        " ".join(
            [
                f"INSERT INTO ref_overrides ({columns_sql}) VALUES ({placeholders})",
                "ON CONFLICT(task, id) DO UPDATE SET",
                assignments,
            ]
        ),
        [payload[column] for column in OVERRIDE_COLUMNS],
    )
    created = get_override(conn, task, id)
    if created is None:
        raise RuntimeError("override row could not be loaded")
    return created


def delete_override(conn, task: str, id: str) -> bool:
    _validate_task(task)
    cursor = conn.execute("DELETE FROM ref_overrides WHERE task = ? AND id = ?", (task, id))
    return int(cursor.rowcount or 0) > 0


def list_images(conn, task: str, ref_id: str) -> list[dict[str, Any]]:
    _validate_task(task)
    rows = conn.execute(
        (
            f"SELECT {', '.join(IMAGE_COLUMNS)} FROM ref_images "
            "WHERE task = ? AND ref_id = ? ORDER BY order_index ASC, created_at ASC, key ASC"
        ),
        (task, ref_id),
    ).fetchall()
    return [_decode_row(row) for row in rows]


def get_image(conn, key: str) -> dict[str, Any] | None:
    row = conn.execute(
        f"SELECT {', '.join(IMAGE_COLUMNS)} FROM ref_images WHERE key = ?",
        (key,),
    ).fetchone()
    return _decode_row(row)


def create_image(conn, row: dict[str, Any]) -> dict[str, Any]:
    payload = _build_image_payload(row)
    columns_sql = ", ".join(IMAGE_COLUMNS)
    placeholders = ", ".join("?" for _ in IMAGE_COLUMNS)
    conn.execute(
        f"INSERT INTO ref_images ({columns_sql}) VALUES ({placeholders})",
        [payload[column] for column in IMAGE_COLUMNS],
    )
    created = get_image(conn, str(payload["key"]))
    if created is None:
        raise RuntimeError("image row could not be loaded")
    return created


def update_image(conn, key: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    current = get_image(conn, key)
    if current is None:
        return None
    if not patch:
        return current
    invalid_fields = sorted(set(patch) - IMAGE_FIELDS)
    if invalid_fields:
        raise ValueError(f"Unsupported image fields: {', '.join(invalid_fields)}")
    merged = {**current, **patch}
    payload = _build_image_payload(merged)
    assignments = ", ".join(f"{column} = ?" for column in IMAGE_COLUMNS[1:-1])
    params = [payload[column] for column in IMAGE_COLUMNS[1:-1]]
    params.append(key)
    conn.execute(f"UPDATE ref_images SET {assignments} WHERE key = ?", params)
    return get_image(conn, key)


def delete_image(conn, key: str) -> bool:
    cursor = conn.execute("DELETE FROM ref_images WHERE key = ?", (key,))
    return int(cursor.rowcount or 0) > 0


def _build_override_payload(
    task: str,
    id: str,
    action: str,
    fields: dict[str, Any],
    current: dict[str, Any] | None,
) -> dict[str, Any]:
    invalid_fields = sorted(set(fields) - OVERRIDE_FIELDS)
    if invalid_fields:
        raise ValueError(f"Unsupported override fields: {', '.join(invalid_fields)}")
    timestamp = _now_iso()
    base = {field: None for field in OVERRIDE_FIELDS}
    if current is not None:
        for field in OVERRIDE_FIELDS:
            base[field] = current.get(field)
    base.update(fields)
    return {
        "task": task,
        "id": id,
        "action": action,
        "content": base["content"],
        "visual_intent": base["visual_intent"],
        "category": base["category"],
        "additional_info": _encode_json(base["additional_info"]),
        "primary_image_key": base["primary_image_key"],
        "created_at": current["created_at"] if current is not None else timestamp,
        "updated_at": timestamp,
    }


def _build_image_payload(row: dict[str, Any]) -> dict[str, Any]:
    invalid_fields = sorted(set(row) - (IMAGE_FIELDS | {"key", "created_at"}))
    if invalid_fields:
        raise ValueError(f"Unsupported image fields: {', '.join(invalid_fields)}")
    task = str(row.get("task") or "").strip()
    ref_id = str(row.get("ref_id") or "").strip()
    role = str(row.get("role") or "").strip()
    file_path = str(row.get("file_path") or "").strip()
    _validate_task(task)
    _validate_role(role)
    if not ref_id:
        raise ValueError("ref_id is required")
    if not file_path:
        raise ValueError("file_path is required")
    return {
        "key": str(row.get("key") or uuid4().hex),
        "task": task,
        "ref_id": ref_id,
        "role": role,
        "style": row.get("style"),
        "file_path": file_path,
        "order_index": int(row.get("order_index", 0)),
        "created_at": str(row.get("created_at") or _now_iso()),
    }


def _decode_override(row: Any) -> dict[str, Any] | None:
    payload = _decode_row(row)
    if payload is None:
        return None
    payload["additional_info"] = _decode_json(payload.get("additional_info"))
    return payload


def _decode_row(row: Any) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def _encode_json(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _decode_json(value: Any) -> dict[str, Any] | None:
    if value in (None, ""):
        return None
    decoded = json.loads(str(value))
    if decoded is None:
        return None
    if not isinstance(decoded, dict):
        raise ValueError("additional_info must decode to an object")
    return decoded


def _validate_task(task: str) -> None:
    if task not in TASKS:
        raise ValueError(f"task must be one of: {', '.join(sorted(TASKS))}")


def _validate_override_action(action: str) -> None:
    if action not in OVERRIDE_ACTIONS:
        raise ValueError(f"action must be one of: {', '.join(sorted(OVERRIDE_ACTIONS))}")


def _validate_role(role: str) -> None:
    if role not in IMAGE_ROLES:
        raise ValueError(f"role must be one of: {', '.join(sorted(IMAGE_ROLES))}")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
