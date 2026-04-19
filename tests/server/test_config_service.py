from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from server import settings
from server.services import config_service


TEST_ENV_VAR = "PAPERBANANA_TEST_PROVIDER_KEY"
LEGACY_ENV_VAR = "GOOGLE_API_KEY"
INITIAL_YAML = f"""
providers:
  - id: inline-provider
    type: openai
    base_url: https://inline.example/v1
    api_key: inline-secret-1234
    models:
      - name: chat-model
        capability: chat
        params:
          temperature: 0.2
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
LEGACY_YAML = """
defaults:
  main_model_name: gemini-3.1-pro-preview
api_keys:
  google_api_key: legacy-secret-1111
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
        calls.append(data)

    monkeypatch.setattr(config_service.provider_registry, "reload_registry", fake_reload)
    return calls


@pytest.fixture()
def legacy_config_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, Path]:
    repo_root = tmp_path
    config_dir = repo_root / "configs"
    config_dir.mkdir()
    yaml_path = config_dir / "model_config.yaml"
    yaml_path.write_text(LEGACY_YAML, encoding="utf-8")
    env_path = repo_root / ".env"
    env_path.write_text("", encoding="utf-8")
    monkeypatch.setattr(settings, "CONFIG_YAML_PATH", yaml_path)
    monkeypatch.delenv(LEGACY_ENV_VAR, raising=False)
    return {"yaml": yaml_path, "env": env_path}


def test_list_providers_returns_masked_keys(
    config_paths: dict[str, Path],
) -> None:
    providers = config_service.list_providers()

    assert [provider.id for provider in providers] == [
        "inline-provider",
        "env-provider",
    ]
    assert providers[0].api_key_masked == "****1234"
    assert providers[0].base_url == "https://inline.example/v1"
    assert providers[0].models == [
        config_service.ModelView(
            id="inline-provider::chat-model",
            name="chat-model",
            kind="text",
            capabilities=["chat"],
        )
    ]
    assert providers[1].api_key_masked == "****5678"
    assert providers[1].models == [
        config_service.ModelView(
            id="env-provider::image-model",
            name="image-model",
            kind="image",
            capabilities=["image"],
        )
    ]


def test_save_config_yaml_writes_file_and_reloads_once(
    config_paths: dict[str, Path],
    reload_spy: list[dict],
) -> None:
    new_text = """
providers:
  - id: saved-provider
    type: openai
    api_key: saved-secret-4321
    models:
      - name: saved-model
        capability: chat
defaults:
  main_model: saved-provider::saved-model
""".lstrip()

    config_service.save_config_yaml(new_text)

    assert config_paths["yaml"].read_text(encoding="utf-8") == new_text
    assert reload_spy == [yaml.safe_load(new_text)]


def test_upsert_provider_key_updates_env_for_placeholder(
    config_paths: dict[str, Path],
    reload_spy: list[dict],
) -> None:
    original_yaml = config_paths["yaml"].read_text(encoding="utf-8")

    config_service.upsert_provider_key("env-provider", "env-secret-9999")

    assert config_paths["yaml"].read_text(encoding="utf-8") == original_yaml
    assert f'{TEST_ENV_VAR}="env-secret-9999"' in config_paths["env"].read_text(
        encoding="utf-8"
    )
    assert reload_spy and reload_spy[0]["providers"][1]["api_key"] == f"${{{TEST_ENV_VAR}}}"


def test_upsert_provider_key_updates_inline_yaml_value(
    config_paths: dict[str, Path],
    reload_spy: list[dict],
) -> None:
    config_service.upsert_provider_key("inline-provider", "inline-secret-7777")

    data = yaml.safe_load(config_paths["yaml"].read_text(encoding="utf-8"))
    assert data["providers"][0]["api_key"] == "inline-secret-7777"
    assert f'{TEST_ENV_VAR}="env-secret-5678"' in config_paths["env"].read_text(
        encoding="utf-8"
    )
    assert reload_spy and reload_spy[0]["providers"][0]["api_key"] == "inline-secret-7777"


def test_save_config_form_round_trips_to_list_providers(
    config_paths: dict[str, Path],
    reload_spy: list[dict],
) -> None:
    providers_rows = [
        ["inline-provider", "openai", "https://updated.example/v1", "updated-inline-2222"],
        ["new-provider", "openai", "https://new.example/v1", "new-secret-3333"],
    ]
    models_rows = [
        ["inline-provider", "chat-model", "chat", ""],
        ["new-provider", "image-model", "image", "openai_images"],
    ]
    defaults = {
        "main_model": "inline-provider::chat-model",
        "image_gen_model": "new-provider::image-model",
    }

    config_service.save_config_form(providers_rows, models_rows, defaults)

    providers = config_service.list_providers()
    assert [provider.id for provider in providers] == ["inline-provider", "new-provider"]
    assert providers[0].api_key_masked == "****2222"
    assert providers[0].base_url == "https://updated.example/v1"
    assert providers[1].api_key_masked == "****3333"
    assert providers[1].models == [
        config_service.ModelView(
            id="new-provider::image-model",
            name="image-model",
            kind="image",
            capabilities=["image"],
        )
    ]

    data = yaml.safe_load(config_paths["yaml"].read_text(encoding="utf-8"))
    assert data["providers"][0]["models"][0]["params"] == {"temperature": 0.2}
    assert reload_spy and reload_spy[0]["defaults"] == defaults


def test_save_config_form_preserves_placeholder_api_key_storage(
    config_paths: dict[str, Path],
    reload_spy: list[dict],
) -> None:
    providers_rows = [["env-provider", "anthropic", "", "env-secret-9999"]]
    models_rows = [["env-provider", "image-model", "image", ""]]

    config_service.save_config_form(
        providers_rows,
        models_rows,
        {"image_gen_model": "env-provider::image-model"},
    )

    data = yaml.safe_load(config_paths["yaml"].read_text(encoding="utf-8"))
    assert data["providers"][0]["api_key"] == f"${{{TEST_ENV_VAR}}}"
    assert config_paths["env"].read_text(encoding="utf-8") == f'{TEST_ENV_VAR}="env-secret-5678"\n'
    assert reload_spy and reload_spy[0]["providers"][0]["api_key"] == f"${{{TEST_ENV_VAR}}}"
    assert config_service.list_providers()[0].api_key_masked == "****5678"


def test_upsert_provider_key_updates_legacy_yaml_value(
    legacy_config_paths: dict[str, Path],
    reload_spy: list[dict],
) -> None:
    config_service.upsert_provider_key("gemini-official", "legacy-secret-2222")

    data = yaml.safe_load(legacy_config_paths["yaml"].read_text(encoding="utf-8"))
    assert data["api_keys"]["google_api_key"] == "legacy-secret-2222"
    assert reload_spy and reload_spy[0]["api_keys"]["google_api_key"] == "legacy-secret-2222"
    assert config_service.list_providers()[0].api_key_masked == "****2222"
