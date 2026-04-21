from __future__ import annotations

import io
import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

import server.settings as settings
import server.refs.store as refs_store
from server.refs.baseline import load_baseline


MAX_IMAGE_BYTES = 10 * 1024 * 1024
BASELINE_ROWS = [
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


@pytest.fixture()
def fake_baseline_api(
    isolated_results: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, Any]:
    del isolated_results
    baseline_root = tmp_path / "data" / "PaperBananaBench"
    diagram_dir = baseline_root / "diagram"
    images_dir = diagram_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    jpeg_bytes = _jpeg_bytes()
    for name in ("ref_1.jpg", "ref_2.jpg"):
        (images_dir / name).write_bytes(jpeg_bytes)
    (diagram_dir / "ref.json").write_text(
        json.dumps(BASELINE_ROWS, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "BASELINE_DIR", baseline_root)
    load_baseline.cache_clear()
    yield {"bytes": jpeg_bytes, "root": baseline_root}
    load_baseline.cache_clear()


@pytest.mark.anyio
async def test_list_refs_merges_baseline_and_overrides(api_client, fake_baseline_api) -> None:
    del fake_baseline_api
    created = await api_client.post(
        "/api/refs",
        params={"task": "diagram"},
        json={"content": "created content", "visual_intent": "created intent"},
    )
    assert created.status_code == 201

    response = await api_client.get("/api/refs", params={"task": "diagram"})

    assert response.status_code == 200
    assert len(response.json()) == 3


@pytest.mark.anyio
async def test_create_and_fetch_roundtrip(api_client, fake_baseline_api) -> None:
    del fake_baseline_api
    created = await api_client.post(
        "/api/refs",
        params={"task": "diagram"},
        json={
            "content": "new ref content",
            "visual_intent": "new ref intent",
            "category": "custom",
            "additional_info": {"source": "api"},
        },
    )
    assert created.status_code == 201
    created_body = created.json()
    assert created_body["id"].startswith("ovr_")

    fetched = await api_client.get(f"/api/refs/diagram/{created_body['id']}")

    assert fetched.status_code == 200
    assert fetched.json()["content"] == "new ref content"


@pytest.mark.anyio
async def test_patch_known_field(api_client, fake_baseline_api) -> None:
    del fake_baseline_api
    patched = await api_client.patch("/api/refs/diagram/ref_1", json={"content": "patched content"})
    assert patched.status_code == 200

    fetched = await api_client.get("/api/refs/diagram/ref_1")

    assert fetched.status_code == 200
    assert fetched.json()["content"] == "patched content"
    assert fetched.json()["visual_intent"] == "baseline intent 1"


@pytest.mark.anyio
async def test_soft_delete_hides_baseline_row(api_client, fake_baseline_api) -> None:
    del fake_baseline_api
    deleted = await api_client.delete("/api/refs/diagram/ref_1")
    assert deleted.status_code == 204

    fetched = await api_client.get("/api/refs/diagram/ref_1")
    listed = await api_client.get("/api/refs", params={"task": "diagram"})

    assert fetched.status_code == 404
    assert all(row["id"] != "ref_1" for row in listed.json())


@pytest.mark.anyio
async def test_unknown_id_returns_404(api_client, fake_baseline_api) -> None:
    del fake_baseline_api
    patched = await api_client.patch("/api/refs/diagram/missing-id", json={"content": "nope"})
    deleted = await api_client.delete("/api/refs/diagram/missing-id")

    assert patched.status_code == 404
    assert deleted.status_code == 404


@pytest.mark.anyio
async def test_unknown_field_rejected(api_client, fake_baseline_api) -> None:
    del fake_baseline_api
    response = await api_client.patch("/api/refs/diagram/ref_1", json={"bogus": "x"})
    assert response.status_code == 422


@pytest.mark.anyio
async def test_upload_image_roundtrip_overlay(
    api_client,
    isolated_results: Path,
    fake_baseline_api,
) -> None:
    del fake_baseline_api
    png_bytes = _png_bytes()

    upload = await api_client.post(
        "/api/refs/diagram/ref_1/images",
        files={
            "file": ("variant.png", png_bytes, "image/png"),
            "role": (None, "variant"),
            "style": (None, "flowchart"),
            "order_index": (None, "0"),
        },
    )

    assert upload.status_code == 200
    images = upload.json()["images"]
    assert len(images) == 2
    overlay = _find_overlay_image(images)
    assert overlay["style"] == "flowchart"

    served = await api_client.get(f"/api/refs/diagram/ref_1/images/{overlay['key']}")
    assert served.status_code == 200
    assert served.content == png_bytes
    assert (isolated_results / overlay["path"]).is_file()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("filename", "content_type", "payload"),
    [
        ("sample.webp", "image/webp", lambda: _webp_bytes()),
        ("sample.jpg", "image/jpeg", lambda: _jpeg_bytes()),
    ],
)
async def test_upload_image_supports_webp_and_jpeg(
    api_client,
    fake_baseline_api,
    filename: str,
    content_type: str,
    payload,
) -> None:
    del fake_baseline_api
    response = await api_client.post(
        "/api/refs/diagram/ref_1/images",
        files={"file": (filename, payload(), content_type)},
    )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_image_unknown_mime_rejected(api_client, fake_baseline_api) -> None:
    del fake_baseline_api
    response = await api_client.post(
        "/api/refs/diagram/ref_1/images",
        files={"file": ("sample.txt", b"plain-text", "text/plain")},
    )
    assert response.status_code == 415


@pytest.mark.anyio
async def test_image_too_large_rejected(api_client, fake_baseline_api) -> None:
    del fake_baseline_api
    oversized = b"x" * (MAX_IMAGE_BYTES + 1)
    response = await api_client.post(
        "/api/refs/diagram/ref_1/images",
        files={"file": ("huge.png", oversized, "image/png")},
    )
    assert response.status_code == 413


@pytest.mark.anyio
async def test_image_atomic_db_failure_keeps_prior_state(
    api_client,
    isolated_results: Path,
    fake_baseline_api,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del fake_baseline_api

    def _boom(*args, **kwargs):
        raise sqlite3.DatabaseError("injected failure")

    monkeypatch.setattr(refs_store, "create_image", _boom)

    with pytest.raises(sqlite3.DatabaseError):
        await api_client.post(
            "/api/refs/diagram/ref_1/images",
            files={"file": ("broken.png", _png_bytes(), "image/png")},
        )

    ref_images_dir = isolated_results / "ref_images"
    if ref_images_dir.exists():
        assert all(path.suffix != ".tmp" for path in ref_images_dir.iterdir())
    fetched = await api_client.get("/api/refs/diagram/ref_1")
    assert fetched.status_code == 200
    assert len(fetched.json()["images"]) == 1


@pytest.mark.anyio
async def test_baseline_image_served(api_client, fake_baseline_api) -> None:
    response = await api_client.get("/api/refs/diagram/ref_1/images/baseline:diagram:ref_1")

    assert response.status_code == 200
    assert response.content == fake_baseline_api["bytes"]


@pytest.mark.anyio
async def test_delete_image_overlay_unlinks_file(
    api_client,
    isolated_results: Path,
    fake_baseline_api,
) -> None:
    del fake_baseline_api
    upload = await api_client.post(
        "/api/refs/diagram/ref_1/images",
        files={"file": ("variant.png", _png_bytes(), "image/png")},
    )
    assert upload.status_code == 200
    overlay = _find_overlay_image(upload.json()["images"])
    overlay_path = isolated_results / overlay["path"]
    assert overlay_path.is_file()

    deleted = await api_client.delete(f"/api/refs/diagram/ref_1/images/{overlay['key']}")

    assert deleted.status_code == 204
    assert not overlay_path.exists()


def _find_overlay_image(images: list[dict[str, Any]]) -> dict[str, Any]:
    for image in images:
        if image["source"] == "overlay":
            return image
    raise AssertionError("overlay image not found")


def _png_bytes() -> bytes:
    return _image_bytes("PNG", (10, 120, 200))


def _jpeg_bytes() -> bytes:
    return _image_bytes("JPEG", (240, 30, 60))


def _webp_bytes() -> bytes:
    return _image_bytes("WEBP", (80, 180, 90))


def _image_bytes(image_format: str, color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (2, 2), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format=image_format)
    return buffer.getvalue()
