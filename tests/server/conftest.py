from __future__ import annotations

import asyncio
import base64
import io
from collections import defaultdict
from pathlib import Path
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

import server.settings as settings
from server.main import app
from server.services import run_service


@pytest.fixture()
def isolated_results(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    results_dir = tmp_path / "results"
    monkeypatch.setattr(
        settings,
        "db_path",
        lambda: results_dir / "paperbanana.db",
        raising=False,
    )
    monkeypatch.setattr(settings, "RUNS_DIR", results_dir / "runs")
    return results_dir


@pytest.fixture()
def fake_processor(
    isolated_results: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> "_FakeFactory":
    factory = _FakeFactory()
    monkeypatch.setattr(run_service, "_build_processor", factory.build)
    monkeypatch.setattr(run_service, "_resolve_model", lambda model_id: None)
    run_service._RUNTIME.clear()
    yield factory
    run_service._RUNTIME.clear()


@pytest.fixture()
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture()
async def api_client(isolated_results: Path) -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


class _FakeFactory:
    def __init__(self) -> None:
        self.calls: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.delays: dict[str, float] = {}

    def build(self, exp_config: Any) -> "_FakeProcessor":
        return _FakeProcessor(exp_config=exp_config, factory=self)


class _FakeProcessor:
    def __init__(self, exp_config: Any, factory: _FakeFactory) -> None:
        self.exp_config = exp_config
        self._factory = factory
        self.vanilla_agent = _FakeAgent("vanilla", exp_config, factory)
        self.retriever_agent = _FakeAgent("retriever", exp_config, factory)
        self.planner_agent = _FakeAgent("planner", exp_config, factory)
        self.stylist_agent = _FakeAgent("stylist", exp_config, factory)
        self.visualizer_agent = _FakeAgent("visualizer", exp_config, factory)
        self.critic_agent = _FakeAgent("critic", exp_config, factory)
        self.polish_agent = _FakeAgent("polish", exp_config, factory)


class _FakeAgent:
    def __init__(self, name: str, exp_config: Any, factory: _FakeFactory) -> None:
        self._name = name
        self._exp_config = exp_config
        self._factory = factory

    async def process(self, data: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        self._factory.calls[self._name].append(
            {
                "main_model": getattr(self._exp_config, "main_model_name", ""),
                "image_model": getattr(self._exp_config, "image_gen_model_name", ""),
                "kwargs": kwargs,
            }
        )
        delay = self._factory.delays.get(self._name, 0.0)
        if delay:
            await asyncio.sleep(delay)
        return _mutate_data(self._name, self._exp_config, data, kwargs)


def _mutate_data(
    name: str,
    exp_config: Any,
    data: dict[str, Any],
    kwargs: dict[str, Any],
) -> dict[str, Any]:
    if name == "retriever":
        data["top10_references"] = ["ref_1", "ref_2"]
        data["retrieved_examples"] = [{"id": "ref_1"}]
        return data
    if name == "planner":
        data["target_diagram_desc0"] = "planner prompt"
        return data
    if name == "stylist":
        data["target_diagram_stylist_desc0"] = "stylist prompt"
        return data
    if name == "visualizer":
        desc_key = _visualizer_desc_key(data)
        data[f"{desc_key}_base64_jpg"] = _image_base64(
            f"{getattr(exp_config, 'image_gen_model_name', '')}:{desc_key}"
        )
        return data
    if name == "critic":
        round_idx = int(data.get("current_critic_round", 0))
        data[f"target_diagram_critic_suggestions{round_idx}"] = "adjust layout"
        data[f"target_diagram_critic_desc{round_idx}"] = f"critic prompt {round_idx}"
        return data
    if name == "vanilla":
        data["vanilla_diagram_base64_jpg"] = _image_base64("vanilla")
        return data
    if name == "polish":
        data["polished_diagram_base64_jpg"] = _image_base64("polish")
        return data
    return data


def _visualizer_desc_key(data: dict[str, Any]) -> str:
    for index in range(4, -1, -1):
        critic_key = f"target_diagram_critic_desc{index}"
        if critic_key in data and f"{critic_key}_base64_jpg" not in data:
            return critic_key
    if "target_diagram_stylist_desc0" in data:
        return "target_diagram_stylist_desc0"
    return "target_diagram_desc0"


def _image_base64(seed: str) -> str:
    value = sum(seed.encode("utf-8")) % 255
    image = Image.new("RGB", (2, 2), color=(value, 120, 200))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")
