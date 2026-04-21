from __future__ import annotations

from pathlib import Path


_REPO_ROOT = Path(__file__).parent.parent.resolve()

DB_PATH: Path = _REPO_ROOT / "results" / "paperbanana.db"
RUNS_DIR: Path = _REPO_ROOT / "results" / "runs"
BASELINE_DIR: Path = Path("data/PaperBananaBench")
CONFIG_YAML_PATH: Path = _REPO_ROOT / "configs" / "model_config.yaml"

VERSION: str = "0.1.0"

