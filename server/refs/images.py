from __future__ import annotations

import mimetypes
import sqlite3
from pathlib import Path
from typing import Any

import server.settings as settings

from . import store


def resolve_all_images(
    conn: sqlite3.Connection,
    task: str,
    ref_id: str,
    baseline_row: dict[str, Any] | None,
    primary_image_key: str | None,
) -> list[dict[str, Any]]:
    images = _baseline_images(task, ref_id, baseline_row)
    images.extend(_overlay_images(conn, task, ref_id))
    return _promote_primary(images, primary_image_key)


def baseline_image_key(task: str, ref_id: str) -> str:
    return f"baseline:{task}:{ref_id}"


def baseline_absolute_path(task: str, relative_path: str) -> Path:
    return (Path(settings.BASELINE_DIR) / task / relative_path).resolve()


def overlay_absolute_path(file_path: str) -> Path:
    path = Path(file_path)
    if path.is_absolute():
        return path
    return (_results_root() / path).resolve()


def guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    return mime or "application/octet-stream"


def _baseline_images(
    task: str,
    ref_id: str,
    baseline_row: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if baseline_row is None or not baseline_row.get("path_to_gt_image"):
        return []
    return [
        {
            "key": baseline_image_key(task, ref_id),
            "role": "main",
            "style": None,
            "source": "baseline",
            "path": baseline_row["path_to_gt_image"],
            "order_index": 0,
        }
    ]


def _overlay_images(conn: sqlite3.Connection, task: str, ref_id: str) -> list[dict[str, Any]]:
    rows = store.list_images(conn, task, ref_id)
    return [{**row, "source": "overlay", "path": row["file_path"]} for row in rows]


def _promote_primary(
    images: list[dict[str, Any]],
    primary_image_key: str | None,
) -> list[dict[str, Any]]:
    if not primary_image_key:
        return images
    index = next((idx for idx, image in enumerate(images) if image["key"] == primary_image_key), None)
    if index is None:
        return images
    promoted = dict(images[index], role="main")
    demoted = [dict(image, role="variant") for image in images if image["key"] != primary_image_key]
    return [promoted, *demoted]


def _results_root() -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured).parent
