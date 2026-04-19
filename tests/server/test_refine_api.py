from __future__ import annotations

import base64
import io

import pytest
from PIL import Image

from server.services import run_service


def _jpeg_base64(color: tuple[int, int, int]) -> str:
    image = Image.new("RGB", (2, 2), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


@pytest.mark.anyio
async def test_refine_returns_image_bytes_and_path(
    api_client,
    fake_processor,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del fake_processor

    async def fake_call_refine(params, model_id: str) -> str:  # noqa: ANN001
        del params
        del model_id
        return _jpeg_base64((10, 120, 200))

    monkeypatch.setattr(run_service, "_call_refine", fake_call_refine)

    response = await api_client.post(
        "/api/refine",
        json={
            "image_base64": _jpeg_base64((100, 20, 30)),
            "edit_prompt": "tighten spacing",
            "image_model": "provider::image-model",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["final_image_path"].endswith("/final/candidate_0.png")
    assert base64.b64decode(body["image_base64"]).startswith(b"\x89PNG\r\n\x1a\n")


@pytest.mark.anyio
async def test_refine_rejects_bad_input(api_client) -> None:
    response = await api_client.post(
        "/api/refine",
        json={
            "image_base64": "not-base64",
            "edit_prompt": "tighten spacing",
            "image_model": "provider::image-model",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "image_base64 must be valid base64"
