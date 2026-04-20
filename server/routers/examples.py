from __future__ import annotations

import logging
import os
import sqlite3
import tempfile
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict

import server.settings as settings
from server.db import connect, init_db
from server.repos import examples_repo

_log = logging.getLogger(__name__)


MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_EXTENSIONS_BY_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
IMAGE_MIME_BY_EXTENSION = {value: key for key, value in IMAGE_EXTENSIONS_BY_MIME.items()}

router = APIRouter(prefix="/api/examples", tags=["examples"])


class ExampleOut(BaseModel):
    id: str
    discipline: str
    title_en: str
    title_zh: str
    method_content_en: str
    method_content_zh: str
    caption_en: str
    caption_zh: str
    suggested_aspect_ratio: str | None = None
    image_path: str | None = None
    priority: Literal[1, 2, 3]
    created_at: str
    updated_at: str


class ExampleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    discipline: str
    title_en: str
    title_zh: str
    method_content_en: str
    method_content_zh: str
    caption_en: str
    caption_zh: str
    suggested_aspect_ratio: str | None = None
    priority: Literal[1, 2, 3] = 2


class ExampleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    discipline: str | None = None
    title_en: str | None = None
    title_zh: str | None = None
    method_content_en: str | None = None
    method_content_zh: str | None = None
    caption_en: str | None = None
    caption_zh: str | None = None
    suggested_aspect_ratio: str | None = None
    priority: Literal[1, 2, 3] | None = None


class ExampleSearchResult(ExampleOut):
    score: float


@router.get("", response_model=list[ExampleOut])
async def list_examples() -> list[ExampleOut]:
    with _open_connection() as connection:
        return [_to_example_out(row) for row in examples_repo.list_examples(connection)]


@router.get("/search", response_model=list[ExampleSearchResult])
async def search_examples(
    query: str = "",
    top_k: int = Query(examples_repo.DEFAULT_TOP_K),
) -> list[ExampleSearchResult]:
    with _open_connection() as connection:
        rows = examples_repo.search_examples(connection, query=query, top_k=top_k)
    return [ExampleSearchResult(**row) for row in rows]


@router.get("/{id}", response_model=ExampleOut)
async def get_example(id: str) -> ExampleOut:
    with _open_connection() as connection:
        row = examples_repo.get_example(connection, id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown example id: {id}")
    return _to_example_out(row)


@router.post("", response_model=ExampleOut, status_code=201)
async def create_example(body: ExampleCreate) -> ExampleOut:
    try:
        with _open_connection() as connection, connection:
            row = examples_repo.create_example(connection, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _to_example_out(row)


@router.patch("/{id}", response_model=ExampleOut)
async def update_example(id: str, body: ExampleUpdate) -> ExampleOut:
    patch = body.model_dump(exclude_unset=True)
    try:
        with _open_connection() as connection, connection:
            row = examples_repo.update_example(connection, id, patch)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown example id: {id}")
    return _to_example_out(row)


@router.delete("/{id}", status_code=204)
async def delete_example(id: str) -> Response:
    with _open_connection() as connection:
        with connection:
            row = examples_repo.get_example(connection, id)
            if row is None:
                raise HTTPException(status_code=404, detail=f"unknown example id: {id}")
            examples_repo.delete_example(connection, id)
    # DB commit succeeded; FS cleanup is best-effort — do not roll back the
    # delete if the image file is already gone or locked.
    _safe_unlink_image(row.get("image_path"))
    return Response(status_code=204)


@router.post("/{id}/image", response_model=ExampleOut)
async def upload_example_image(id: str, file: UploadFile = File(...)) -> ExampleOut:
    # Atomicity story (v3 — unique filenames):
    # Each upload writes to a fresh, never-referenced path
    # `examples/{id}-{token}.{ext}`. `os.replace` therefore cannot overwrite
    # any currently-served file, so the prior image keeps serving live
    # traffic until the DB commit flips the pointer. If the DB commit fails
    # we leak one orphan file; the DB stays consistent with the old pointer
    # and the old bytes.
    extension = _extension_for_upload(file)
    data = await _read_upload_bytes(file)
    token = uuid.uuid4().hex[:8]
    final_relative = (Path("examples") / f"{id}-{token}.{extension}").as_posix()
    final_path = _results_root() / final_relative
    final_path.parent.mkdir(parents=True, exist_ok=True)

    tmp = tempfile.NamedTemporaryFile(
        delete=False,
        dir=str(final_path.parent),
        suffix=".tmp",
    )
    tmp_path: Path | None = Path(tmp.name)
    try:
        try:
            tmp.write(data)
        finally:
            tmp.close()

        # Pre-check existence WITHOUT mutating the DB.
        with _open_connection() as connection:
            prior_row = examples_repo.get_example(connection, id)
        if prior_row is None:
            raise HTTPException(status_code=404, detail=f"unknown example id: {id}")
        prior_path = prior_row.get("image_path")

        # Publish to a fresh path. `final_path` is guaranteed not to exist
        # (uuid token collisions are negligible), so this cannot overwrite
        # live bytes.
        os.replace(tmp_path, final_path)
        tmp_path = None  # os.replace consumed it

        # Now commit the DB pointer. If this fails we leak one orphan file,
        # but the DB stays consistent with the prior pointer AND the prior
        # bytes (the prior file was not touched).
        with _open_connection() as connection:
            with connection:
                updated = examples_repo.set_image_path(connection, id, final_relative)
    except Exception:
        if tmp_path is not None:
            try:
                tmp_path.unlink()
            except FileNotFoundError:
                pass
        raise

    # DB commit succeeded — best-effort cleanup of the prior file.
    if prior_path and prior_path != final_relative:
        _safe_unlink_image(prior_path)

    if updated is None:
        raise HTTPException(status_code=404, detail=f"unknown example id: {id}")
    return _to_example_out(updated)


@router.get("/{id}/image")
async def get_example_image(id: str) -> FileResponse:
    with _open_connection() as connection:
        row = examples_repo.get_example(connection, id)
    if row is None or not row.get("image_path"):
        raise HTTPException(status_code=404, detail=f"missing image for example id: {id}")
    file_path = _results_root() / str(row["image_path"])
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"missing image for example id: {id}")
    return FileResponse(file_path, media_type=_media_type_for_path(file_path))


def _open_connection() -> sqlite3.Connection:
    # Seed is seeded once by the FastAPI startup hook — do NOT re-run it on
    # every request: that creates a race between startup and early traffic
    # and adds TOCTOU risk between count-check and insert.
    init_db()
    return connect()


def _to_example_out(row: dict) -> ExampleOut:
    return ExampleOut(**row)


def _extension_for_upload(file: UploadFile) -> str:
    content_type = str(file.content_type or "")
    extension = IMAGE_EXTENSIONS_BY_MIME.get(content_type)
    if extension is None:
        raise HTTPException(status_code=415, detail=f"unsupported image type: {content_type}")
    return extension


async def _read_upload_bytes(file: UploadFile) -> bytes:
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image file exceeds 5 MB limit")
    return data


def _safe_unlink_image(image_path: str | None) -> None:
    """Best-effort filesystem cleanup — never raises."""
    if not image_path:
        return
    try:
        (_results_root() / image_path).unlink()
    except FileNotFoundError:
        return
    except OSError as exc:
        _log.warning("failed to unlink example image %s: %s", image_path, exc)


def _media_type_for_path(file_path: Path) -> str:
    extension = file_path.suffix.lstrip(".").lower()
    return IMAGE_MIME_BY_EXTENSION.get(extension, "application/octet-stream")


def _results_root() -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured).parent
