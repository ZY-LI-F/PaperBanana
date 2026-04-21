from __future__ import annotations

import json
import random
from pathlib import Path

import pytest

import server.settings as settings
from agents.retriever_agent import RetrieverAgent
from server.refs import service
from server.refs.baseline import load_baseline
from utils.config import ExpConfig


@pytest.fixture()
def isolated_ref_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    baseline_root = tmp_path / "data" / "PaperBananaBench"
    diagram_dir = baseline_root / "diagram"
    diagram_dir.mkdir(parents=True, exist_ok=True)
    rows = [
        {"id": "ref_1", "content": "baseline content 1", "visual_intent": "baseline intent 1", "path_to_gt_image": "images/ref_1.jpg"},
        {"id": "ref_2", "content": "baseline content 2", "visual_intent": "baseline intent 2", "path_to_gt_image": "images/ref_2.jpg"},
    ]
    (diagram_dir / "ref.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    results_dir = tmp_path / "results"
    monkeypatch.setattr(settings, "BASELINE_DIR", baseline_root)
    monkeypatch.setattr(settings, "RUNS_DIR", results_dir / "runs")
    monkeypatch.setattr(settings, "db_path", lambda: results_dir / "paperbanana.db", raising=False)
    load_baseline.cache_clear()
    yield tmp_path
    load_baseline.cache_clear()


def test_load_random_references_uses_merged_refs(
    isolated_ref_env: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created = service.create_ref("diagram", content="created content", visual_intent="created intent")
    assert service.soft_delete_ref("diagram", "ref_1") is True
    monkeypatch.setattr(random, "sample", lambda seq, count: list(seq)[:count])
    agent = RetrieverAgent(
        exp_config=ExpConfig(
            dataset_name="PaperBananaBench",
            task_name="diagram",
            main_model_name="test-main",
            image_gen_model_name="test-image",
            work_dir=isolated_ref_env,
        )
    )

    selected = agent._load_random_references(agent.task_config)

    assert selected == ["ref_2", created["id"]]
