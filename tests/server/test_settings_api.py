from __future__ import annotations

from pathlib import Path

import pytest
import yaml

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
async def test_get_providers_returns_masked_shape(api_client, config_paths) -> None:
    response = await api_client.get("/api/providers")

    assert response.status_code == 200
    body = response.json()
    assert [provider["id"] for provider in body["providers"]] == [
        "inline-provider",
        "env-provider",
    ]
    assert body["providers"][0]["api_key_masked"] == "****1234"
    assert body["providers"][0]["models"][0]["kind"] == "text"
    assert body["providers"][1]["api_key_masked"] == "****5678"
    assert body["providers"][1]["models"][0]["kind"] == "image"


@pytest.mark.anyio
async def test_put_providers_updates_yaml_env_and_reloads_once(
    api_client,
    config_paths,
    reload_spy,
) -> None:
    response = await api_client.put(
        "/api/providers",
        json={
            "providers": [
                {
                    "id": "inline-provider",
                    "type": "openai",
                    "base_url": "https://updated.example/v1",
                    "api_key": "updated-inline-2222",
                    "models": [{"name": "chat-model", "capability": "chat", "invoke": ""}],
                },
                {
                    "id": "env-provider",
                    "type": "anthropic",
                    "base_url": "",
                    "api_key": "env-secret-9999",
                    "models": [{"name": "image-model", "capability": "image", "invoke": ""}],
                },
            ],
            "defaults": {
                "main_model": "inline-provider::chat-model",
                "image_gen_model": "env-provider::image-model",
            },
        },
    )

    assert response.status_code == 200
    assert len(reload_spy) == 1
    body = response.json()
    assert body["providers"][0]["api_key_masked"] == "****2222"
    assert body["providers"][1]["api_key_masked"] == "****9999"

    yaml_data = yaml.safe_load(config_paths["yaml"].read_text(encoding="utf-8"))
    assert yaml_data["providers"][0]["base_url"] == "https://updated.example/v1"
    assert yaml_data["providers"][0]["api_key"] == "updated-inline-2222"
    assert yaml_data["providers"][1]["api_key"] == f"${{{TEST_ENV_VAR}}}"
    assert config_paths["env"].read_text(encoding="utf-8") == f'{TEST_ENV_VAR}="env-secret-9999"\n'


@pytest.mark.anyio
async def test_put_config_yaml_preserves_masked_inline_key(
    api_client,
    config_paths,
    reload_spy,
) -> None:
    get_response = await api_client.get("/api/config/yaml")
    assert get_response.status_code == 200
    assert "inline-secret-1234" not in get_response.json()["yaml"]

    updated_yaml = get_response.json()["yaml"].replace(
        "https://inline.example/v1",
        "https://yaml-updated.example/v1",
    )
    put_response = await api_client.put("/api/config/yaml", json={"yaml": updated_yaml})

    assert put_response.status_code == 200
    assert len(reload_spy) == 1
    saved = yaml.safe_load(config_paths["yaml"].read_text(encoding="utf-8"))
    assert saved["providers"][0]["api_key"] == "inline-secret-1234"
    assert saved["providers"][0]["base_url"] == "https://yaml-updated.example/v1"


@pytest.mark.anyio
async def test_defaults_round_trip(api_client, config_paths, reload_spy) -> None:
    get_response = await api_client.get("/api/defaults")
    assert get_response.status_code == 200
    assert get_response.json()["defaults"] == {
        "main_model": "inline-provider::chat-model",
        "image_gen_model": "env-provider::image-model",
    }

    put_response = await api_client.put(
        "/api/defaults",
        json={"defaults": {"main_model": "env-provider::image-model"}},
    )

    assert put_response.status_code == 200
    assert len(reload_spy) == 1
    assert put_response.json()["defaults"] == {"main_model": "env-provider::image-model"}
    saved = yaml.safe_load(config_paths["yaml"].read_text(encoding="utf-8"))
    assert saved["defaults"] == {"main_model": "env-provider::image-model"}
