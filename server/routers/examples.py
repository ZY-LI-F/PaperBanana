from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

import server.settings as settings
from server.db import connect, init_db
from server.repos import examples_repo
from server.seeds.examples_seed import seed_if_empty


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
    with _open_connection() as connection, connection:
        row = examples_repo.create_example(connection, body.model_dump())
    return _to_example_out(row)


@router.patch("/{id}", response_model=ExampleOut)
async def update_example(id: str, body: ExampleUpdate) -> ExampleOut:
    patch = body.model_dump(exclude_unset=True)
    with _open_connection() as connection, connection:
        row = examples_repo.update_example(connection, id, patch)
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown example id: {id}")
    return _to_example_out(row)


@router.delete("/{id}", status_code=204)
async def delete_example(id: str) -> Response:
    with _open_connection() as connection, connection:
        row = examples_repo.get_example(connection, id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"unknown example id: {id}")
        _delete_example_image(row.get("image_path"))
        examples_repo.delete_example(connection, id)
    return Response(status_code=204)


@router.post("/{id}/image", response_model=ExampleOut)
async def upload_example_image(id: str, file: UploadFile = File(...)) -> ExampleOut:
    with _open_connection() as connection, connection:
        row = examples_repo.get_example(connection, id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"unknown example id: {id}")
        extension = _extension_for_upload(file)
        data = await _read_upload_bytes(file)
        image_path = _write_example_image(id, extension, data)
        _remove_previous_image(row.get("image_path"), image_path)
        updated = examples_repo.set_image_path(connection, id, image_path)
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
    init_db()
    connection = connect()
    with connection:
        seed_if_empty(connection)
    return connection


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


def _write_example_image(id: str, extension: str, data: bytes) -> str:
    relative_path = Path("examples") / f"{id}.{extension}"
    target_path = _results_root() / relative_path
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(data)
    return relative_path.as_posix()


def _remove_previous_image(previous_path: str | None, current_path: str) -> None:
    if not previous_path or previous_path == current_path:
        return
    _delete_example_image(previous_path)


def _delete_example_image(image_path: str | None) -> None:
    if not image_path:
        return
    try:
        (_results_root() / image_path).unlink()
    except FileNotFoundError:
        return


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
