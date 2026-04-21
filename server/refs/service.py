from __future__ import annotations

import sqlite3
from typing import Any
from uuid import uuid4

from server.db import connect, init_db

from . import store
from .baseline import load_baseline
from .images import (
    baseline_absolute_path,
    baseline_image_key,
    guess_mime,
    overlay_absolute_path,
    resolve_all_images,
)


TASKS = frozenset({"diagram", "plot"})
REF_FIELDS = ("content", "visual_intent", "category", "additional_info", "primary_image_key")


def list_refs(task: str, *, include_deleted: bool = False) -> list[dict[str, Any]]:
    task_name = _validate_task(task)
    baseline_rows = load_baseline(task_name)
    with _open_connection() as conn:
        overrides = {row["id"]: row for row in store.list_overrides(conn, task_name)}
        rows = _merge_baseline_rows(conn, task_name, baseline_rows, overrides, include_deleted)
        rows.extend(_merge_created_rows(conn, task_name, baseline_rows, overrides))
    return rows


def get_ref(task: str, ref_id: str) -> dict[str, Any] | None:
    task_name = _validate_task(task)
    with _open_connection() as conn:
        return _get_ref_with_connection(conn, task_name, ref_id)


def upsert_ref(
    task: str,
    ref_id: str,
    *,
    content=None,
    visual_intent=None,
    category=None,
    additional_info=None,
    primary_image_key=None,
) -> dict[str, Any]:
    task_name = _validate_task(task)
    fields = _ref_fields(content, visual_intent, category, additional_info, primary_image_key)
    with _open_connection() as conn, conn:
        action = _override_action(conn, task_name, ref_id, fields)
        store.upsert_override(conn, task_name, ref_id, action, fields)
        row = _get_ref_with_connection(conn, task_name, ref_id)
    if row is None:
        raise RuntimeError("updated ref could not be loaded")
    return row


def create_ref(
    task: str,
    *,
    content,
    visual_intent,
    category=None,
    additional_info=None,
) -> dict[str, Any]:
    task_name = _validate_task(task)
    ref_id = f"ovr_{uuid4().hex[:8]}"
    fields = _ref_fields(content, visual_intent, category, additional_info, None)
    _ensure_create_fields(fields, None)
    with _open_connection() as conn, conn:
        store.upsert_override(conn, task_name, ref_id, "create", fields)
        row = _get_ref_with_connection(conn, task_name, ref_id)
    if row is None:
        raise RuntimeError("created ref could not be loaded")
    return row


def soft_delete_ref(task: str, ref_id: str) -> bool:
    task_name = _validate_task(task)
    with _open_connection() as conn, conn:
        if _get_ref_with_connection(conn, task_name, ref_id, include_deleted=True) is None:
            return False
        store.upsert_override(conn, task_name, ref_id, "delete", {})
    return True


def add_image(
    task: str,
    ref_id: str,
    *,
    file_path: str,
    role: str,
    style: str | None,
    order_index: int = 0,
) -> dict[str, Any]:
    task_name = _validate_task(task)
    with _open_connection() as conn, conn:
        if _get_ref_with_connection(conn, task_name, ref_id) is None:
            raise ValueError(f"unknown ref id: {ref_id}")
        return store.create_image(
            conn,
            {
                "task": task_name,
                "ref_id": ref_id,
                "role": role,
                "style": style,
                "file_path": file_path,
                "order_index": order_index,
            },
        )


def update_image(key: str, **patch) -> dict[str, Any] | None:
    with _open_connection() as conn, conn:
        return store.update_image(conn, key, patch)


def remove_image(key: str) -> bool:
    with _open_connection() as conn, conn:
        return store.delete_image(conn, key)


def resolve_image(task: str, ref_id: str, key: str) -> dict[str, Any] | None:
    task_name = _validate_task(task)
    baseline_row = load_baseline(task_name).get(ref_id)
    if key == baseline_image_key(task_name, ref_id):
        if baseline_row is None or not baseline_row.get("path_to_gt_image"):
            return None
        absolute_path = baseline_absolute_path(task_name, str(baseline_row["path_to_gt_image"]))
        return {"absolute_path": absolute_path, "mime": guess_mime(absolute_path)}
    with _open_connection() as conn:
        image = store.get_image(conn, key)
    if image is None or image["task"] != task_name or image["ref_id"] != ref_id:
        return None
    absolute_path = overlay_absolute_path(str(image["file_path"]))
    return {"absolute_path": absolute_path, "mime": guess_mime(absolute_path)}


def _merge_baseline_rows(
    conn: sqlite3.Connection,
    task: str,
    baseline_rows: dict[str, dict[str, Any]],
    overrides: dict[str, dict[str, Any]],
    include_deleted: bool,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ref_id, baseline_row in baseline_rows.items():
        override = overrides.get(ref_id)
        if override and override["action"] == "delete" and not include_deleted:
            continue
        rows.append(_compose_row(conn, task, ref_id, baseline_row, override))
    return rows


def _merge_created_rows(
    conn: sqlite3.Connection,
    task: str,
    baseline_rows: dict[str, dict[str, Any]],
    overrides: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for override in overrides.values():
        if override["action"] != "create" or override["id"] in baseline_rows:
            continue
        rows.append(_build_from_override(conn, task, override))
    return rows


def _get_ref_with_connection(
    conn: sqlite3.Connection,
    task: str,
    ref_id: str,
    *,
    include_deleted: bool = False,
) -> dict[str, Any] | None:
    baseline_row = load_baseline(task).get(ref_id)
    override = store.get_override(conn, task, ref_id)
    if override is None:
        return None if baseline_row is None else _compose_row(conn, task, ref_id, baseline_row, None)
    if override["action"] == "delete" and not include_deleted:
        return None
    if baseline_row is None:
        return None if override["action"] != "create" else _build_from_override(conn, task, override)
    return _compose_row(conn, task, ref_id, baseline_row, override)


def _compose_row(
    conn: sqlite3.Connection,
    task: str,
    ref_id: str,
    baseline_row: dict[str, Any],
    override: dict[str, Any] | None,
) -> dict[str, Any]:
    merged = _apply_override(baseline_row, override)
    primary_key = None if override is None else override.get("primary_image_key")
    merged["images"] = resolve_all_images(conn, task, ref_id, baseline_row, primary_key)
    return merged


def _build_from_override(
    conn: sqlite3.Connection,
    task: str,
    override: dict[str, Any],
) -> dict[str, Any]:
    merged = _apply_override(None, override)
    merged["images"] = resolve_all_images(
        conn,
        task,
        override["id"],
        None,
        override.get("primary_image_key"),
    )
    return merged


def _apply_override(
    baseline_row: dict[str, Any] | None,
    override: dict[str, Any] | None,
) -> dict[str, Any]:
    merged = dict(baseline_row or {})
    if baseline_row is None:
        merged.update({"id": override["id"], "_baseline": False, "split": "ref"})
    if override is None:
        return merged
    for field in REF_FIELDS:
        value = override.get(field)
        if value is not None:
            merged[field] = value
    merged.setdefault("additional_info", {})
    return merged


def _override_action(
    conn: sqlite3.Connection,
    task: str,
    ref_id: str,
    fields: dict[str, Any],
) -> str:
    current = store.get_override(conn, task, ref_id)
    if ref_id in load_baseline(task):
        return "patch"
    _ensure_create_fields(fields, current)
    if current is not None and current["action"] == "create":
        return "create"
    return "create"


def _ensure_create_fields(
    fields: dict[str, Any],
    current: dict[str, Any] | None,
) -> None:
    current = current or {}
    if fields.get("content") or current.get("content"):
        if fields.get("visual_intent") or current.get("visual_intent"):
            return
    raise ValueError("content and visual_intent are required for created refs")


def _ref_fields(
    content,
    visual_intent,
    category,
    additional_info,
    primary_image_key,
) -> dict[str, Any]:
    fields = {
        "content": content,
        "visual_intent": visual_intent,
        "category": category,
        "additional_info": additional_info,
        "primary_image_key": primary_image_key,
    }
    return {key: value for key, value in fields.items() if value is not None}


def _open_connection() -> sqlite3.Connection:
    init_db()
    return connect()


def _validate_task(task: str) -> str:
    if task not in TASKS:
        raise ValueError(f"task must be one of: {', '.join(sorted(TASKS))}")
    return task
