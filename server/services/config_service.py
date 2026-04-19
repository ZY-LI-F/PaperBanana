from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Mapping

from utils import provider_registry

from server.services._config_storage import (
    atomic_write_text,
    config_path,
    dump_yaml,
    get_config_yaml_text,
    load_config_data,
    mask_api_key,
    parse_yaml_text,
    placeholder_name,
    prime_process_env,
    read_env_values,
    resolve_config_key,
    upsert_env_value,
)


IMAGE_CAPABILITY = "image"
LEGACY_PROVIDER_KEY_FIELDS = {
    "gemini-official": "google_api_key",
    "openai-official": "openai_api_key",
    "anthropic-official": "anthropic_api_key",
    "openrouter": "openrouter_api_key",
}


@dataclass(frozen=True)
class ModelView:
    id: str
    name: str
    kind: str
    capabilities: list[str]


@dataclass(frozen=True)
class ProviderView:
    id: str
    name: str
    base_url: str
    api_key_masked: str
    models: list[ModelView]


def list_providers() -> list[ProviderView]:
    data = load_config_data()
    registry = provider_registry.Registry()
    registry.load_from_dict(data)
    raw_providers = data.get("providers") or []
    if raw_providers:
        return _raw_provider_views(raw_providers, registry, read_env_values())
    return _legacy_provider_views(registry)


def get_config_yaml() -> str:
    return get_config_yaml_text()


def save_config_yaml(text: str) -> None:
    data = parse_yaml_text(text)
    atomic_write_text(config_path(), text)
    _reload_registry(data)


def save_config_form(
    providers_rows: Any,
    models_rows: Any,
    defaults: Mapping[str, Any] | None,
) -> None:
    provider_rows = _coerce_rows(providers_rows)
    model_rows = _coerce_rows(models_rows)
    current_data = load_config_data()
    env_values = read_env_values()
    env_updates = _placeholder_env_updates(provider_rows, current_data, env_values)
    data = _build_form_data(provider_rows, model_rows, defaults, current_data, env_values)
    atomic_write_text(config_path(), dump_yaml(data))
    _apply_env_updates(env_updates)
    _reload_registry(data)


def upsert_provider_key(provider_id: str, key: str) -> None:
    data = load_config_data()
    config_node, field = _find_provider_key_target(data, provider_id)
    variable = placeholder_name(config_node.get(field, ""))
    if variable:
        upsert_env_value(variable, key)
        os.environ[variable] = key
    else:
        config_node[field] = key
        atomic_write_text(config_path(), dump_yaml(data))
    _reload_registry(data)


def reload() -> None:
    _reload_registry(load_config_data())


def _reload_registry(data: dict[str, Any]) -> None:
    prime_process_env()
    provider_registry.reload_registry(data)


def _raw_provider_views(
    raw_providers: list[dict[str, Any]],
    registry: provider_registry.Registry,
    env_values: dict[str, str],
) -> list[ProviderView]:
    views: list[ProviderView] = []
    for raw_provider in raw_providers:
        provider_id = str(raw_provider.get("id") or "").strip()
        if not provider_id:
            continue
        resolved = registry.providers.get(provider_id)
        views.append(
            ProviderView(
                id=provider_id,
                name=provider_id,
                base_url=_provider_base_url(raw_provider, resolved),
                api_key_masked=mask_api_key(
                    resolve_config_key(raw_provider.get("api_key", ""), env_values)
                ),
                models=_model_views(provider_id, resolved, raw_provider.get("models") or []),
            )
        )
    return views


def _legacy_provider_views(
    registry: provider_registry.Registry,
) -> list[ProviderView]:
    return [
        ProviderView(
            id=provider.id,
            name=provider.id,
            base_url=provider.base_url or "",
            api_key_masked=mask_api_key(provider.api_key),
            models=_model_views(provider.id, provider, []),
        )
        for provider in registry.providers.values()
    ]


def _provider_base_url(
    raw_provider: dict[str, Any],
    resolved: provider_registry.Provider | None,
) -> str:
    if resolved and resolved.base_url:
        return resolved.base_url
    return str(raw_provider.get("base_url") or "")


def _model_views(
    provider_id: str,
    resolved: provider_registry.Provider | None,
    raw_models: list[Any],
) -> list[ModelView]:
    if resolved:
        return [
            ModelView(
                id=model.id,
                name=model.name,
                kind=_kind_from_capability(model.capability),
                capabilities=[model.capability],
            )
            for model in resolved.models
        ]
    return [_raw_model_view(provider_id, raw_model) for raw_model in raw_models]


def _raw_model_view(provider_id: str, raw_model: Any) -> ModelView:
    if isinstance(raw_model, str):
        model_name, capability = raw_model, "chat"
    else:
        model_name = str(raw_model.get("name") or "").strip()
        capability = str(raw_model.get("capability") or "chat").strip()
    return ModelView(
        id=f"{provider_id}::{model_name}",
        name=model_name,
        kind=_kind_from_capability(capability),
        capabilities=[capability],
    )


def _kind_from_capability(capability: str) -> str:
    return "image" if capability == IMAGE_CAPABILITY else "text"


def _build_form_data(
    providers_rows: Any,
    models_rows: Any,
    defaults: Mapping[str, Any] | None,
    current_data: Mapping[str, Any] | None = None,
    env_values: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    if current_data is None:
        current_data = load_config_data()
    if env_values is None:
        env_values = read_env_values()
    providers = _provider_rows_to_config(
        _coerce_rows(providers_rows),
        _stored_provider_api_keys(current_data),
        env_values,
    )
    _attach_models(providers, _coerce_rows(models_rows), _existing_model_params(current_data))
    return {"providers": providers, "defaults": _normalize_defaults(defaults)}


def _apply_env_updates(env_updates: Mapping[str, str]) -> None:
    for variable, value in env_updates.items():
        upsert_env_value(variable, value)
        os.environ[variable] = value


def _placeholder_env_updates(
    rows: list[Any],
    data: Mapping[str, Any],
    env_values: Mapping[str, str],
) -> dict[str, str]:
    stored_api_keys = _stored_provider_api_keys(data)
    env_updates: dict[str, str] = {}
    for row in rows:
        provider_id, _, _, api_key = _normalized_row(row, 4)
        stored_api_key = stored_api_keys.get(provider_id, "")
        variable = placeholder_name(stored_api_key)
        if variable and api_key and not _is_masked_stored_value(
            api_key,
            stored_api_key,
            env_values,
        ):
            env_updates[variable] = api_key
    return env_updates


def _is_masked_stored_value(
    submitted_value: str,
    stored_api_key: str,
    env_values: Mapping[str, str],
) -> bool:
    current_value = resolve_config_key(stored_api_key, env_values)
    return bool(current_value) and submitted_value == mask_api_key(current_value)


def _provider_rows_to_config(
    rows: list[Any],
    stored_api_keys: Mapping[str, str],
    env_values: Mapping[str, str],
) -> list[dict[str, Any]]:
    providers: list[dict[str, Any]] = []
    for row in rows:
        provider_id, provider_type, base_url, api_key = _normalized_row(row, 4)
        if not provider_id:
            continue
        provider: dict[str, Any] = {"id": provider_id, "type": provider_type or "openai"}
        if base_url:
            provider["base_url"] = base_url
        stored_api_key = stored_api_keys.get(provider_id, "")
        provider["api_key"] = _submitted_api_key(api_key, stored_api_key, env_values)
        provider["models"] = []
        providers.append(provider)
    return providers


def _submitted_api_key(
    submitted_api_key: str,
    stored_api_key: str,
    env_values: Mapping[str, str],
) -> str:
    if placeholder_name(stored_api_key):
        return stored_api_key
    if _is_masked_stored_value(submitted_api_key, stored_api_key, env_values):
        return stored_api_key
    return submitted_api_key


def _attach_models(
    providers: list[dict[str, Any]],
    rows: list[Any],
    params_by_model: dict[tuple[str, str], dict[str, Any]],
) -> None:
    providers_by_id = {provider["id"]: provider for provider in providers}
    for row in rows:
        provider_id, model_name, capability, invoke = _normalized_row(row, 4)
        if not provider_id or not model_name or provider_id not in providers_by_id:
            continue
        model = {"name": model_name, "capability": capability or "chat"}
        if invoke:
            model["invoke"] = invoke
        params = params_by_model.get((provider_id, model_name))
        if params:
            model["params"] = params
        providers_by_id[provider_id]["models"].append(model)


def _existing_model_params(data: Mapping[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    params_by_model: dict[tuple[str, str], dict[str, Any]] = {}
    for provider in data.get("providers") or []:
        provider_id = str(provider.get("id") or "").strip()
        for raw_model in provider.get("models") or []:
            if not isinstance(raw_model, Mapping):
                continue
            model_name = str(raw_model.get("name") or "").strip()
            params = raw_model.get("params") or {}
            if provider_id and model_name and params:
                params_by_model[(provider_id, model_name)] = dict(params)
    return params_by_model


def _stored_provider_api_keys(data: Mapping[str, Any]) -> dict[str, str]:
    stored_api_keys: dict[str, str] = {}
    for provider in data.get("providers") or []:
        provider_id = str(provider.get("id") or "").strip()
        if provider_id:
            stored_api_keys[provider_id] = str(provider.get("api_key") or "")
    legacy_api_keys = data.get("api_keys") or {}
    if isinstance(legacy_api_keys, Mapping):
        for provider_id, field in LEGACY_PROVIDER_KEY_FIELDS.items():
            if field in legacy_api_keys:
                stored_api_keys[provider_id] = str(legacy_api_keys.get(field) or "")
    return stored_api_keys


def _normalize_defaults(defaults: Mapping[str, Any] | None) -> dict[str, str]:
    if defaults is None:
        return {}
    if not isinstance(defaults, Mapping):
        raise TypeError("defaults must be a mapping")
    return {
        str(key): str(value).strip()
        for key, value in defaults.items()
        if str(value or "").strip()
    }


def _coerce_rows(value: Any) -> list[Any]:
    if value is None:
        return []
    if hasattr(value, "values"):
        try:
            return value.values.tolist()
        except Exception:
            pass
    return list(value)


def _normalized_row(row: Any, size: int) -> list[str]:
    values = list(row) + [""] * size
    return [str(value or "").strip() for value in values[:size]]


def _find_provider_key_target(
    data: dict[str, Any],
    provider_id: str,
) -> tuple[dict[str, Any], str]:
    for provider in data.get("providers") or []:
        if str(provider.get("id") or "").strip() == provider_id:
            return provider, "api_key"
    field = LEGACY_PROVIDER_KEY_FIELDS.get(provider_id)
    if field:
        api_keys = data.setdefault("api_keys", {})
        if not isinstance(api_keys, dict):
            raise TypeError("Config YAML api_keys must contain a mapping")
        return api_keys, field
    raise ValueError(f"Unknown provider id: {provider_id}")
