from __future__ import annotations

import io
import sqlite3

import pytest
from PIL import Image

from server.repos import examples_repo


BASE_BODY = {
    "discipline": "Discovery",
    "title_en": "API crispr example",
    "title_zh": "API crispr 示例",
    "method_content_en": "crispr method payload",
    "method_content_zh": "crispr 方法 内容",
    "caption_en": "crispr caption payload",
    "caption_zh": "crispr 说明 内容",
}


@pytest.mark.anyio
async def test_list_sorted_by_priority_desc(api_client, isolated_results) -> None:
    del isolated_results
    initial = await api_client.get("/api/examples")
    assert initial.status_code == 200
    seed_rows = initial.json()
    assert len(seed_rows) == 6

    target_id = seed_rows[-1]["id"]
    patched = await api_client.patch(f"/api/examples/{target_id}", json={"priority": 3})
    assert patched.status_code == 200

    response = await api_client.get("/api/examples")
    rows = response.json()

    assert response.status_code == 200
    assert rows[0]["id"] == target_id
    assert rows[0]["priority"] == 3


@pytest.mark.anyio
async def test_create_and_fetch_roundtrip(api_client, isolated_results) -> None:
    del isolated_results
    created = await api_client.post("/api/examples", json={**BASE_BODY, "priority": 2})
    assert created.status_code == 201
    created_body = created.json()

    fetched = await api_client.get(f"/api/examples/{created_body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["title_en"] == BASE_BODY["title_en"]


@pytest.mark.anyio
async def test_patch_404_and_priority_422(api_client, isolated_results) -> None:
    del isolated_results
    missing = await api_client.patch("/api/examples/missing-id", json={"title_en": "Nope"})
    assert missing.status_code == 404

    rows = (await api_client.get("/api/examples")).json()
    invalid = await api_client.patch(f"/api/examples/{rows[0]['id']}", json={"priority": 4})
    assert invalid.status_code == 422


@pytest.mark.anyio
async def test_delete_removes_image_file(api_client, isolated_results) -> None:
    rows = (await api_client.get("/api/examples")).json()
    example_id = rows[0]["id"]
    png_bytes = _png_bytes()

    upload = await api_client.post(
        f"/api/examples/{example_id}/image",
        files={"file": ("a.png", png_bytes, "image/png")},
    )
    assert upload.status_code == 200
    image_path = isolated_results / "examples" / f"{example_id}.png"
    assert image_path.is_file()

    deleted = await api_client.delete(f"/api/examples/{example_id}")

    assert deleted.status_code == 204
    assert not image_path.exists()


@pytest.mark.anyio
async def test_image_upload_and_serve_roundtrip(api_client, isolated_results) -> None:
    del isolated_results
    rows = (await api_client.get("/api/examples")).json()
    example_id = rows[0]["id"]
    png_bytes = _png_bytes()

    upload = await api_client.post(
        f"/api/examples/{example_id}/image",
        files={"file": ("a.png", png_bytes, "image/png")},
    )
    assert upload.status_code == 200
    assert upload.json()["image_path"] == f"examples/{example_id}.png"

    served = await api_client.get(f"/api/examples/{example_id}/image")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == png_bytes


@pytest.mark.anyio
async def test_image_rejects_non_image_mime(api_client, isolated_results) -> None:
    del isolated_results
    rows = (await api_client.get("/api/examples")).json()
    example_id = rows[0]["id"]

    response = await api_client.post(
        f"/api/examples/{example_id}/image",
        files={"file": ("a.txt", b"plain-text", "text/plain")},
    )

    assert response.status_code == 415


@pytest.mark.anyio
async def test_search_endpoint_priority_boost(api_client, isolated_results) -> None:
    del isolated_results
    medium = await api_client.post(
        "/api/examples",
        json={**BASE_BODY, "title_en": "Medium crispr", "title_zh": "中 crispr", "priority": 2},
    )
    high = await api_client.post(
        "/api/examples",
        json={**BASE_BODY, "title_en": "High crispr", "title_zh": "高 crispr", "priority": 3},
    )
    assert medium.status_code == 201
    assert high.status_code == 201

    response = await api_client.get("/api/examples/search", params={"query": "crispr", "top_k": 2})
    hits = response.json()

    assert response.status_code == 200
    assert [hits[0]["id"], hits[1]["id"]] == [high.json()["id"], medium.json()["id"]]
    assert hits[0]["score"] > hits[1]["score"]


@pytest.mark.anyio
async def test_patch_empty_title_returns_400(api_client, isolated_results) -> None:
    del isolated_results
    rows = (await api_client.get("/api/examples")).json()
    response = await api_client.patch(
        f"/api/examples/{rows[0]['id']}", json={"title_en": ""}
    )
    assert response.status_code == 400
    assert "title_en" in response.json().get("detail", "")


@pytest.mark.anyio
async def test_patch_null_required_field_returns_400(api_client, isolated_results) -> None:
    del isolated_results
    rows = (await api_client.get("/api/examples")).json()
    response = await api_client.patch(
        f"/api/examples/{rows[0]['id']}", json={"title_en": None}
    )
    assert response.status_code == 400


@pytest.mark.anyio
async def test_patch_priority_still_422(api_client, isolated_results) -> None:
    del isolated_results
    rows = (await api_client.get("/api/examples")).json()
    response = await api_client.patch(
        f"/api/examples/{rows[0]['id']}", json={"priority": 4}
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_upload_image_rolls_back_temp_on_db_failure(
    api_client, isolated_results, monkeypatch
) -> None:
    rows = (await api_client.get("/api/examples")).json()
    example_id = rows[0]["id"]
    original_image_path = rows[0].get("image_path")

    def _boom(*args, **kwargs):
        raise sqlite3.DatabaseError("injected failure")

    monkeypatch.setattr(examples_repo, "set_image_path", _boom)

    with pytest.raises(sqlite3.DatabaseError):
        await api_client.post(
            f"/api/examples/{example_id}/image",
            files={"file": ("a.png", _png_bytes(), "image/png")},
        )

    examples_dir = isolated_results / "examples"
    if examples_dir.exists():
        leftover = list(examples_dir.iterdir())
        assert all(p.suffix != ".tmp" for p in leftover), leftover
        assert all(p.stem != example_id for p in leftover), leftover

    refetched = await api_client.get(f"/api/examples/{example_id}")
    assert refetched.status_code == 200
    assert refetched.json().get("image_path") == original_image_path


@pytest.mark.anyio
async def test_upload_image_replaces_old_extension_atomically(
    api_client, isolated_results
) -> None:
    rows = (await api_client.get("/api/examples")).json()
    example_id = rows[0]["id"]

    first = await api_client.post(
        f"/api/examples/{example_id}/image",
        files={"file": ("a.png", _png_bytes(), "image/png")},
    )
    assert first.status_code == 200

    second = await api_client.post(
        f"/api/examples/{example_id}/image",
        files={"file": ("a.jpg", _jpeg_bytes(), "image/jpeg")},
    )
    assert second.status_code == 200
    assert second.json()["image_path"].endswith(".jpg")

    examples_dir = isolated_results / "examples"
    siblings = {p.name for p in examples_dir.iterdir()}
    assert f"{example_id}.jpg" in siblings
    assert f"{example_id}.png" not in siblings
    assert not any(name.endswith(".tmp") for name in siblings), siblings


@pytest.mark.anyio
async def test_delete_leaves_no_file_behind_even_if_unlink_races(
    api_client, isolated_results, monkeypatch
) -> None:
    rows = (await api_client.get("/api/examples")).json()
    example_id = rows[0]["id"]

    upload = await api_client.post(
        f"/api/examples/{example_id}/image",
        files={"file": ("a.png", _png_bytes(), "image/png")},
    )
    assert upload.status_code == 200

    import pathlib

    original_unlink = pathlib.Path.unlink

    def _raise_missing(self, *args, **kwargs):
        if self.name == f"{example_id}.png":
            raise FileNotFoundError(str(self))
        return original_unlink(self, *args, **kwargs)

    monkeypatch.setattr(pathlib.Path, "unlink", _raise_missing, raising=False)

    deleted = await api_client.delete(f"/api/examples/{example_id}")
    assert deleted.status_code == 204

    refetched = await api_client.get(f"/api/examples/{example_id}")
    assert refetched.status_code == 404


def test_import_main_has_no_side_effects(tmp_path, monkeypatch) -> None:
    """Importing server.main must not touch disk — writes only happen on startup."""
    import subprocess
    import sys

    code = (
        "import sys, pathlib; "
        "results = pathlib.Path(sys.argv[1]); "
        "import server.settings as s; "
        "s.db_path = lambda: results / 'paperbanana.db'; "
        "s.RUNS_DIR = results / 'runs'; "
        "import server.main; "  # noqa: unused
        "print('RESULTS_EXISTS=' + str(results.exists()))"
    )
    target = tmp_path / "results"
    result = subprocess.run(
        [sys.executable, "-c", code, str(target)],
        capture_output=True,
        text=True,
        cwd=str(pathlib_project_root()),
    )
    assert result.returncode == 0, result.stderr
    assert "RESULTS_EXISTS=False" in result.stdout, result.stdout


def pathlib_project_root():
    import pathlib
    return pathlib.Path(__file__).resolve().parents[2]


def _png_bytes() -> bytes:
    image = Image.new("RGB", (2, 2), color=(10, 120, 200))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _jpeg_bytes() -> bytes:
    image = Image.new("RGB", (2, 2), color=(240, 30, 60))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()
