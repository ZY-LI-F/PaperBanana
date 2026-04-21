from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

import server.settings as settings
from server.db import connect, init_db
from server.refs import service
from server.refs.baseline import load_baseline
from server.refs import store


@pytest.fixture()
def fake_baseline(
    isolated_results: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, Any]:
    del isolated_results
    baseline_root = tmp_path / "data" / "PaperBananaBench"
    diagram_dir = baseline_root / "diagram"
    images_dir = diagram_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    for name in ("ref_1.jpg", "ref_2.jpg"):
        (images_dir / name).write_bytes(b"fake")
    rows = [
        {
            "id": "ref_1",
            "content": "baseline content 1",
            "visual_intent": "baseline intent 1",
            "path_to_gt_image": "images/ref_1.jpg",
            "category": "vision_perception",
            "additional_info": {"file_name": "ref_1.jpg", "width": 100, "height": 50},
            "split": "ref",
        },
        {
            "id": "ref_2",
            "content": "baseline content 2",
            "visual_intent": "baseline intent 2",
            "path_to_gt_image": "images/ref_2.jpg",
            "category": "data_analysis",
            "additional_info": {"file_name": "ref_2.jpg", "width": 80, "height": 40},
            "split": "ref",
        },
    ]
    (diagram_dir / "ref.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(settings, "BASELINE_DIR", baseline_root)
    load_baseline.cache_clear()
    yield {"root": baseline_root, "rows": rows}
    load_baseline.cache_clear()


def test_ddl_tables_created(isolated_results: Path, fake_baseline: dict[str, Any]) -> None:
    del isolated_results, fake_baseline
    init_db()
    with connect() as conn:
        names = {
            row["name"]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')")
        }
    assert "ref_overrides" in names
    assert "ref_images" in names
    assert "idx_ref_images_ref" in names


def test_list_baseline_only(isolated_results: Path, fake_baseline: dict[str, Any]) -> None:
    del isolated_results
    rows = service.list_refs("diagram")
    assert [row["id"] for row in rows] == ["ref_1", "ref_2"]
    first = rows[0]
    assert first["content"] == fake_baseline["rows"][0]["content"]
    assert first["visual_intent"] == fake_baseline["rows"][0]["visual_intent"]
    assert first["images"] == [
        {
            "key": "baseline:diagram:ref_1",
            "role": "main",
            "style": None,
            "source": "baseline",
            "path": "images/ref_1.jpg",
            "order_index": 0,
        }
    ]


def test_patch_override_applies(isolated_results: Path, fake_baseline: dict[str, Any]) -> None:
    del isolated_results, fake_baseline
    with _connection() as conn, conn:
        store.upsert_override(conn, "diagram", "ref_1", "patch", {"content": "patched content"})
    row = service.get_ref("diagram", "ref_1")
    assert row is not None
    assert row["content"] == "patched content"
    assert row["visual_intent"] == "baseline intent 1"
    assert row["category"] == "vision_perception"


def test_create_override_appears_in_list(isolated_results: Path, fake_baseline: dict[str, Any]) -> None:
    del isolated_results, fake_baseline
    with _connection() as conn, conn:
        store.upsert_override(
            conn,
            "diagram",
            "ovr_new_ref",
            "create",
            {
                "content": "created content",
                "visual_intent": "created intent",
                "category": "custom",
                "additional_info": {"source": "test"},
            },
        )
    row = _find_ref(service.list_refs("diagram"), "ovr_new_ref")
    assert row["_baseline"] is False
    assert row["content"] == "created content"
    assert row["images"] == []


def test_soft_delete_hides_baseline(isolated_results: Path, fake_baseline: dict[str, Any]) -> None:
    del isolated_results, fake_baseline
    with _connection() as conn, conn:
        store.upsert_override(conn, "diagram", "ref_1", "delete", {})
    assert _find_ref(service.list_refs("diagram"), "ref_1") is None
    deleted = _find_ref(service.list_refs("diagram", include_deleted=True), "ref_1")
    assert deleted is not None
    assert deleted["content"] == "baseline content 1"


def test_overlay_image_resolution(isolated_results: Path, fake_baseline: dict[str, Any]) -> None:
    del isolated_results, fake_baseline
    image = service.add_image(
        "diagram",
        "ref_1",
        file_path="ref_images/custom.png",
        role="variant",
        style="flowchart",
        order_index=5,
    )
    row = _find_ref(service.list_refs("diagram"), "ref_1")
    assert row is not None
    assert [item["key"] for item in row["images"]] == ["baseline:diagram:ref_1", image["key"]]
    assert row["images"][1]["style"] == "flowchart"
    assert row["images"][1]["source"] == "overlay"


def test_primary_image_key_swaps_main(
    isolated_results: Path,
    fake_baseline: dict[str, Any],
) -> None:
    del isolated_results, fake_baseline
    image = service.add_image(
        "diagram",
        "ref_1",
        file_path="ref_images/alt.png",
        role="variant",
        style="flowchart",
    )
    service.upsert_ref("diagram", "ref_1", primary_image_key=image["key"])
    row = service.get_ref("diagram", "ref_1")
    assert row is not None
    assert row["images"][0]["key"] == image["key"]
    assert row["images"][0]["role"] == "main"
    assert row["images"][1]["key"] == "baseline:diagram:ref_1"
    assert row["images"][1]["role"] == "variant"


def test_resolve_image_baseline_path(
    isolated_results: Path,
    fake_baseline: dict[str, Any],
) -> None:
    del isolated_results
    resolved = service.resolve_image("diagram", "ref_1", "baseline:diagram:ref_1")
    assert resolved is not None
    expected = (fake_baseline["root"] / "diagram" / "images" / "ref_1.jpg").resolve()
    assert resolved["absolute_path"] == expected
    assert resolved["mime"] == "image/jpeg"


def test_resolve_image_overlay_path(isolated_results: Path, fake_baseline: dict[str, Any]) -> None:
    del fake_baseline
    image = service.add_image(
        "diagram",
        "ref_1",
        file_path="ref_images/overlay.webp",
        role="variant",
        style=None,
    )
    resolved = service.resolve_image("diagram", "ref_1", image["key"])
    assert resolved is not None
    assert resolved["absolute_path"] == (isolated_results / "ref_images" / "overlay.webp").resolve()
    assert resolved["mime"] == "image/webp"


def _connection() -> sqlite3.Connection:
    init_db()
    return connect()


def _find_ref(rows: list[dict[str, Any]], ref_id: str) -> dict[str, Any] | None:
    for row in rows:
        if row["id"] == ref_id:
            return row
    return None
