from __future__ import annotations

import logging
import os
import sqlite3
import tempfile
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

import server.settings as settings
from server.db import connect, init_db
from server.refs import service
import server.refs.store as refs_store


MAX_IMAGE_BYTES = 10 * 1024 * 1024
IMAGE_EXTENSIONS_BY_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
IMAGE_NOT_FOUND_DETAIL = "unknown image key"
EMPTY_PATCH_DETAIL = "patch body must not be empty"
TaskName = Literal["diagram", "plot"]
ImageRole = Literal["main", "variant"]

_log = logging.getLogger(__name__)

refs_router = APIRouter(prefix="/api/refs", tags=["refs"])


class RefImageOut(BaseModel):
    key: str
    role: ImageRole
    style: str | None = None
    source: Literal["baseline", "overlay"]
    path: str
    order_index: int


class RefOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    # `content` is a string for diagram refs (markdown methodology) but a
    # structured dict for plot refs (chart data such as
    # {"Year":[...], "Crop Yield":[...]}). Keep the union loose so both
    # baseline schemas validate.
    content: str | dict[str, Any]
    visual_intent: str
    category: str | None = None
    additional_info: dict[str, Any] = Field(default_factory=dict)
    primary_image_key: str | None = None
    path_to_gt_image: str | None = None
    split: str | None = None
    is_baseline: bool = Field(
        default=False,
        alias="_baseline",
        serialization_alias="_baseline",
    )
    images: list[RefImageOut] = Field(default_factory=list)


class RefCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str | dict[str, Any]
    visual_intent: str
    category: str | None = None
    additional_info: dict[str, Any] | None = None


class RefPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str | dict[str, Any] | None = None
    visual_intent: str | None = None
    category: str | None = None
    additional_info: dict[str, Any] | None = None
    primary_image_key: str | None = None


class ImagePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: ImageRole | None = None
    style: str | None = None
    order_index: int | None = None


@refs_router.get("", response_model=list[RefOut])
async def list_refs(task: TaskName = Query(...)) -> list[RefOut]:
    return [_to_ref_out(row) for row in service.list_refs(task)]


@refs_router.get("/{task}/{ref_id}", response_model=RefOut)
async def get_ref(task: TaskName, ref_id: str) -> RefOut:
    return _to_ref_out(_require_ref(task, ref_id))


@refs_router.post("", response_model=RefOut, status_code=201)
async def create_ref(body: RefCreate, task: TaskName = Query(...)) -> RefOut:
    try:
        row = service.create_ref(
            task,
            content=body.content,
            visual_intent=body.visual_intent,
            category=body.category,
            additional_info=body.additional_info,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _to_ref_out(row)


@refs_router.patch("/{task}/{ref_id}", response_model=RefOut)
async def patch_ref(task: TaskName, ref_id: str, body: RefPatch) -> RefOut:
    _require_ref(task, ref_id)
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=400, detail=EMPTY_PATCH_DETAIL)
    try:
        row = service.upsert_ref(task, ref_id, **patch)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _to_ref_out(row)


@refs_router.delete("/{task}/{ref_id}", status_code=204)
async def delete_ref(task: TaskName, ref_id: str) -> Response:
    if not service.soft_delete_ref(task, ref_id):
        raise HTTPException(status_code=404, detail=f"unknown ref id: {ref_id}")
    return Response(status_code=204)


@refs_router.post("/{task}/{ref_id}/images", response_model=RefOut)
async def upload_ref_image(
    task: TaskName,
    ref_id: str,
    file: UploadFile = File(...),
    role: ImageRole = Form("variant"),
    style: str | None = Form(None),
    order_index: int = Form(0),
) -> RefOut:
    extension = _extension_for_upload(file)
    data = await _read_upload_bytes(file)
    _require_ref(task, ref_id)
    final_relative, final_path = _new_overlay_target(extension)

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
        os.replace(tmp_path, final_path)
        tmp_path = None
        service.add_image(
            task,
            ref_id,
            file_path=final_relative,
            role=role,
            style=style,
            order_index=order_index,
        )
    except ValueError as exc:
        if tmp_path is not None:
            _unlink_tmp(tmp_path)
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception:
        if tmp_path is not None:
            _unlink_tmp(tmp_path)
        raise
    return _to_ref_out(_require_ref(task, ref_id))


@refs_router.patch("/{task}/{ref_id}/images/{key}", response_model=RefOut)
async def patch_ref_image(task: TaskName, ref_id: str, key: str, body: ImagePatch) -> RefOut:
    image = _require_overlay_image(task, ref_id, key)
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=400, detail=EMPTY_PATCH_DETAIL)
    updated = service.update_image(key, **patch)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"{IMAGE_NOT_FOUND_DETAIL}: {key}")
    return _to_ref_out(_require_ref(image["task"], image["ref_id"]))


@refs_router.delete("/{task}/{ref_id}/images/{key}", status_code=204)
async def delete_ref_image(task: TaskName, ref_id: str, key: str) -> Response:
    image = _require_overlay_image(task, ref_id, key)
    if not service.remove_image(key):
        raise HTTPException(status_code=404, detail=f"{IMAGE_NOT_FOUND_DETAIL}: {key}")
    _safe_unlink_overlay(str(image["file_path"]))
    return Response(status_code=204)


@refs_router.get("/{task}/{ref_id}/images/{key}")
async def get_ref_image(task: TaskName, ref_id: str, key: str) -> FileResponse:
    resolved = service.resolve_image(task, ref_id, key)
    if resolved is None:
        raise HTTPException(status_code=404, detail=f"{IMAGE_NOT_FOUND_DETAIL}: {key}")
    file_path = Path(str(resolved["absolute_path"]))
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"{IMAGE_NOT_FOUND_DETAIL}: {key}")
    return FileResponse(file_path, media_type=str(resolved["mime"]))


def _open_connection() -> sqlite3.Connection:
    init_db()
    return connect()


def _require_ref(task: TaskName, ref_id: str) -> dict[str, Any]:
    row = service.get_ref(task, ref_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown ref id: {ref_id}")
    return row


def _require_overlay_image(task: TaskName, ref_id: str, key: str) -> dict[str, Any]:
    with _open_connection() as connection:
        image = refs_store.get_image(connection, key)
    if image is None or image["task"] != task or image["ref_id"] != ref_id:
        raise HTTPException(status_code=404, detail=f"{IMAGE_NOT_FOUND_DETAIL}: {key}")
    return image


def _to_ref_out(row: dict[str, Any]) -> RefOut:
    return RefOut.model_validate(row)


def _extension_for_upload(file: UploadFile) -> str:
    content_type = str(file.content_type or "")
    extension = IMAGE_EXTENSIONS_BY_MIME.get(content_type)
    if extension is None:
        raise HTTPException(status_code=415, detail=f"unsupported image type: {content_type}")
    return extension


async def _read_upload_bytes(file: UploadFile) -> bytes:
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image file exceeds 10 MB limit")
    return data


def _new_overlay_target(extension: str) -> tuple[str, Path]:
    token = uuid.uuid4().hex[:8]
    relative_path = (Path("ref_images") / f"{token}.{extension}").as_posix()
    absolute_path = _results_root() / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    return relative_path, absolute_path


def _unlink_tmp(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return


def _safe_unlink_overlay(file_path: str) -> None:
    absolute_path = _overlay_absolute_path(file_path)
    overlay_root = (_results_root() / "ref_images").resolve()
    try:
        absolute_path.relative_to(overlay_root)
    except ValueError:
        return
    try:
        absolute_path.unlink()
    except FileNotFoundError:
        return
    except OSError as exc:
        _log.warning("failed to unlink ref image %s: %s", absolute_path, exc)


def _overlay_absolute_path(file_path: str) -> Path:
    path = Path(file_path)
    if path.is_absolute():
        return path.resolve()
    return (_results_root() / path).resolve()


def _results_root() -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured).parent
