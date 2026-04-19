from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Mapping

import yaml

from server import settings


ENV_EXPORT_PREFIX = "export "
PLACEHOLDER_PREFIX = "${"
PLACEHOLDER_SUFFIX = "}"


def config_path() -> Path:
    return settings.CONFIG_YAML_PATH


def env_path() -> Path:
    return config_path().parent.parent / ".env"


def get_config_yaml_text() -> str:
    path = config_path()
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8-sig")


def load_config_data() -> dict[str, Any]:
    path = config_path()
    if not path.exists():
        return {}
    return parse_yaml_text(path.read_text(encoding="utf-8-sig"))


def parse_yaml_text(text: str) -> dict[str, Any]:
    data = yaml.safe_load(text) or {}
    if not isinstance(data, dict):
        raise TypeError("Config YAML must contain a mapping at the top level")
    return data


def dump_yaml(data: dict[str, Any]) -> str:
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        delete=False,
    ) as handle:
        handle.write(text)
        temp_path = Path(handle.name)
    temp_path.replace(path)


def read_env_values() -> dict[str, str]:
    path = env_path()
    env_values = parse_env_text(path.read_text(encoding="utf-8")) if path.exists() else {}
    env_values.update(os.environ)
    return env_values


def parse_env_text(text: str) -> dict[str, str]:
    env_values: dict[str, str] = {}
    for line in text.splitlines():
        key = env_line_key(line)
        if not key:
            continue
        _, raw_value = line.split("=", 1)
        env_values[key] = strip_wrapping_quotes(raw_value.strip())
    return env_values


def env_line_key(line: str) -> str | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key = stripped.split("=", 1)[0].strip()
    if key.startswith(ENV_EXPORT_PREFIX):
        key = key[len(ENV_EXPORT_PREFIX):].strip()
    return key or None


def strip_wrapping_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def prime_process_env() -> None:
    for key, value in read_env_values().items():
        os.environ.setdefault(key, value)


def upsert_env_value(name: str, value: str) -> None:
    if "\n" in value or "\r" in value:
        raise ValueError("Environment values must be single-line strings")
    path = env_path()
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    rendered = render_env_assignment(name, value)
    next_lines = replace_env_lines(lines, name, rendered)
    text = "\n".join(next_lines)
    if next_lines:
        text += "\n"
    atomic_write_text(path, text)


def render_env_assignment(name: str, value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'{name}="{escaped}"'


def replace_env_lines(lines: list[str], name: str, rendered: str) -> list[str]:
    updated = False
    next_lines: list[str] = []
    for line in lines:
        if env_line_key(line) == name:
            next_lines.append(rendered)
            updated = True
            continue
        next_lines.append(line)
    if not updated:
        next_lines.append(rendered)
    return next_lines


def resolve_config_key(raw_value: Any, env_values: Mapping[str, str]) -> str:
    name = placeholder_name(raw_value)
    if name:
        return env_values.get(name, "")
    return str(raw_value or "")


def placeholder_name(raw_value: Any) -> str | None:
    text = str(raw_value or "").strip()
    if not text.startswith(PLACEHOLDER_PREFIX) or not text.endswith(PLACEHOLDER_SUFFIX):
        return None
    name = text[len(PLACEHOLDER_PREFIX):-len(PLACEHOLDER_SUFFIX)].strip()
    return name or None


def mask_api_key(value: str) -> str:
    if not value:
        return ""
    return f"****{value[-4:]}"
