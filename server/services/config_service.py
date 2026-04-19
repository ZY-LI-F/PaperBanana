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
    data = _build_form_data(providers_rows, models_rows, defaults)
    atomic_write_text(config_path(), dump_yaml(data))
    _reload_registry(data)


def upsert_provider_key(provider_id: str, key: str) -> None:
    data = load_config_data()
    provider = _find_provider_config(data, provider_id)
    variable = placeholder_name(provider.get("api_key", ""))
    if variable:
        upsert_env_value(variable, key)
        os.environ[variable] = key
    else:
        provider["api_key"] = key
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
) -> dict[str, Any]:
    providers = _provider_rows_to_config(_coerce_rows(providers_rows))
    _attach_models(providers, _coerce_rows(models_rows), _existing_model_params())
    return {"providers": providers, "defaults": _normalize_defaults(defaults)}


def _provider_rows_to_config(rows: list[Any]) -> list[dict[str, Any]]:
    providers: list[dict[str, Any]] = []
    for row in rows:
        provider_id, provider_type, base_url, api_key = _normalized_row(row, 4)
        if not provider_id:
            continue
        provider: dict[str, Any] = {"id": provider_id, "type": provider_type or "openai"}
        if base_url:
            provider["base_url"] = base_url
        provider["api_key"] = api_key
        provider["models"] = []
        providers.append(provider)
    return providers


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


def _existing_model_params() -> dict[tuple[str, str], dict[str, Any]]:
    params_by_model: dict[tuple[str, str], dict[str, Any]] = {}
    for provider in load_config_data().get("providers") or []:
        provider_id = str(provider.get("id") or "").strip()
        for raw_model in provider.get("models") or []:
            if not isinstance(raw_model, Mapping):
                continue
            model_name = str(raw_model.get("name") or "").strip()
            params = raw_model.get("params") or {}
            if provider_id and model_name and params:
                params_by_model[(provider_id, model_name)] = dict(params)
    return params_by_model


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


def _find_provider_config(
    data: dict[str, Any],
    provider_id: str,
) -> dict[str, Any]:
    for provider in data.get("providers") or []:
        if str(provider.get("id") or "").strip() == provider_id:
            return provider
    raise ValueError(f"Unknown provider id: {provider_id}")
