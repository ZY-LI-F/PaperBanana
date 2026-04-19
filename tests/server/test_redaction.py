from __future__ import annotations

import json
from pathlib import Path

import pytest

from server import settings
from server.services import config_service


TEST_ENV_VAR = "PAPERBANANA_TEST_PROVIDER_KEY"
INITIAL_YAML = f"""
providers:
  - id: inline-provider
    type: openai
    base_url: https://inline.example/v1
    api_key: inline-secret-1234
    models:
      - name: chat-model
        capability: chat
  - id: env-provider
    type: anthropic
    api_key: ${{{TEST_ENV_VAR}}}
    models:
      - name: image-model
        capability: image
defaults:
  main_model: inline-provider::chat-model
  image_gen_model: env-provider::image-model
""".lstrip()


@pytest.fixture()
def config_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    repo_root = tmp_path
    config_dir = repo_root / "configs"
    config_dir.mkdir()
    yaml_path = config_dir / "model_config.yaml"
    yaml_path.write_text(INITIAL_YAML, encoding="utf-8")
    env_path = repo_root / ".env"
    env_path.write_text(f'{TEST_ENV_VAR}="env-secret-5678"\n', encoding="utf-8")
    monkeypatch.setattr(settings, "CONFIG_YAML_PATH", yaml_path)
    monkeypatch.delenv(TEST_ENV_VAR, raising=False)
    return {"yaml": yaml_path, "env": env_path}


@pytest.fixture()
def reload_spy(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    calls: list[dict] = []

    def fake_reload(data: dict | None = None) -> None:
        calls.append(data or {})

    monkeypatch.setattr(config_service.provider_registry, "reload_registry", fake_reload)
    return calls


@pytest.mark.anyio
async def test_settings_endpoints_never_return_raw_api_keys(
    api_client,
    config_paths,
    reload_spy,
) -> None:
    responses = [
        (await api_client.get("/api/providers")).json(),
        (
            await api_client.put(
                "/api/providers",
                json={
                    "providers": [
                        {
                            "id": "inline-provider",
                            "type": "openai",
                            "base_url": "https://inline.example/v1",
                            "api_key": "inline-secret-7777",
                            "models": [{"name": "chat-model", "capability": "chat"}],
                        },
                        {
                            "id": "env-provider",
                            "type": "anthropic",
                            "api_key": "env-secret-9999",
                            "models": [{"name": "image-model", "capability": "image"}],
                        },
                    ],
                    "defaults": {"main_model": "inline-provider::chat-model"},
                },
            )
        ).json(),
        (await api_client.get("/api/config/yaml")).json(),
        (
            await api_client.put(
                "/api/config/yaml",
                json={"yaml": (await api_client.get("/api/config/yaml")).json()["yaml"]},
            )
        ).json(),
        (await api_client.get("/api/defaults")).json(),
        (
            await api_client.put(
                "/api/defaults",
                json={"defaults": {"image_gen_model": "env-provider::image-model"}},
            )
        ).json(),
    ]

    serialized = json.dumps(responses, ensure_ascii=False, sort_keys=True)

    assert "inline-secret-1234" not in serialized
    assert "inline-secret-7777" not in serialized
    assert "env-secret-5678" not in serialized
    assert "env-secret-9999" not in serialized
    assert "****1234" in serialized
    assert "****7777" in serialized
    assert "****9999" in serialized
