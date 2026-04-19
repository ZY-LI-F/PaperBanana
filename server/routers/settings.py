from __future__ import annotations

from copy import deepcopy
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from server.services import config_service
from server.services._config_storage import (
    dump_yaml,
    load_config_data,
    mask_api_key,
    parse_yaml_text,
    placeholder_name,
)


router = APIRouter(prefix="/api", tags=["settings"])


class ProviderModelInput(BaseModel):
    name: str
    capability: str = "chat"
    invoke: str = ""


class ProviderInput(BaseModel):
    id: str
    type: str = "openai"
    base_url: str = ""
    api_key: str = ""
    api_key_masked: str = ""
    models: list[ProviderModelInput] = Field(default_factory=list)


class ProvidersRequest(BaseModel):
    providers: list[ProviderInput]
    defaults: dict[str, str] = Field(default_factory=dict)


class YamlRequest(BaseModel):
    yaml: str


class DefaultsRequest(BaseModel):
    defaults: dict[str, str] = Field(default_factory=dict)


@router.get("/providers")
async def get_providers() -> dict[str, list[dict[str, Any]]]:
    return {"providers": _provider_payload()}


@router.put("/providers")
async def put_providers(request: ProvidersRequest) -> dict[str, list[dict[str, Any]]]:
    provider_rows, model_rows = _to_rows(request.providers)
    try:
        config_service.save_config_form(provider_rows, model_rows, request.defaults)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"providers": _provider_payload()}


@router.get("/config/yaml")
async def get_config_yaml() -> dict[str, str]:
    return {"yaml": _redacted_yaml_text()}


@router.put("/config/yaml")
async def put_config_yaml(request: YamlRequest) -> dict[str, str]:
    try:
        submitted = parse_yaml_text(request.yaml)
        merged = _restore_masked_values(submitted, load_config_data())
        config_service.save_config_yaml(dump_yaml(merged))
    except (TypeError, ValueError, yaml.YAMLError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"yaml": _redacted_yaml_text()}


@router.get("/defaults")
async def get_defaults() -> dict[str, dict[str, str]]:
    return {"defaults": _defaults_payload()}


@router.put("/defaults")
async def put_defaults(request: DefaultsRequest) -> dict[str, dict[str, str]]:
    data = load_config_data()
    data["defaults"] = _normalize_defaults(request.defaults)
    try:
        config_service.save_config_yaml(dump_yaml(data))
    except (TypeError, ValueError, yaml.YAMLError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"defaults": _defaults_payload()}


def _provider_payload() -> list[dict[str, Any]]:
    raw_data = load_config_data()
    raw_providers = {
        str(provider.get("id") or "").strip(): provider
        for provider in raw_data.get("providers") or []
        if isinstance(provider, dict)
    }
    payload: list[dict[str, Any]] = []
    for provider in config_service.list_providers():
        raw_provider = raw_providers.get(provider.id, {})
        raw_models = _raw_models_by_name(raw_provider.get("models") or [])
        models = []
        for model in provider.models:
            raw_model = raw_models.get(model.name, {})
            capability = str(
                raw_model.get("capability")
                or (model.capabilities[0] if model.capabilities else "chat")
            )
            models.append(
                {
                    "id": model.id,
                    "name": model.name,
                    "kind": model.kind,
                    "capability": capability,
                    "capabilities": model.capabilities,
                    "invoke": str(raw_model.get("invoke") or ""),
                }
            )
        payload.append(
            {
                "id": provider.id,
                "name": provider.name,
                "type": str(raw_provider.get("type") or ""),
                "base_url": provider.base_url,
                "api_key_masked": provider.api_key_masked,
                "models": models,
            }
        )
    return payload


def _raw_models_by_name(raw_models: list[Any]) -> dict[str, dict[str, Any]]:
    models: dict[str, dict[str, Any]] = {}
    for item in raw_models:
        if isinstance(item, str):
            models[item] = {"name": item}
            continue
        if isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            if name:
                models[name] = item
    return models


def _to_rows(providers: list[ProviderInput]) -> tuple[list[list[str]], list[list[str]]]:
    provider_rows: list[list[str]] = []
    model_rows: list[list[str]] = []
    for provider in providers:
        api_key = provider.api_key or provider.api_key_masked
        provider_rows.append([provider.id, provider.type, provider.base_url, api_key])
        for model in provider.models:
            model_rows.append([provider.id, model.name, model.capability, model.invoke])
    return provider_rows, model_rows


def _redacted_yaml_text() -> str:
    data = _masked_config_data(load_config_data())
    return dump_yaml(data) if data else ""


def _masked_config_data(data: dict[str, Any]) -> dict[str, Any]:
    masked = deepcopy(data)
    for provider in masked.get("providers") or []:
        if isinstance(provider, dict):
            provider["api_key"] = _mask_inline_secret(provider.get("api_key"))
    api_keys = masked.get("api_keys")
    if isinstance(api_keys, dict):
        for key, value in list(api_keys.items()):
            api_keys[key] = _mask_inline_secret(value)
    return masked


def _mask_inline_secret(value: Any) -> str:
    text = str(value or "")
    if not text or placeholder_name(text):
        return text
    return mask_api_key(text)


def _restore_masked_values(
    submitted: dict[str, Any],
    current: dict[str, Any],
) -> dict[str, Any]:
    merged = deepcopy(submitted)
    current_providers = {
        str(provider.get("id") or "").strip(): provider
        for provider in current.get("providers") or []
        if isinstance(provider, dict)
    }
    for provider in merged.get("providers") or []:
        if not isinstance(provider, dict):
            continue
        provider_id = str(provider.get("id") or "").strip()
        current_provider = current_providers.get(provider_id)
        if not current_provider:
            continue
        provider["api_key"] = _restore_mask(provider.get("api_key"), current_provider.get("api_key"))

    current_api_keys = current.get("api_keys")
    submitted_api_keys = merged.get("api_keys")
    if isinstance(current_api_keys, dict) and isinstance(submitted_api_keys, dict):
        for key, value in list(submitted_api_keys.items()):
            submitted_api_keys[key] = _restore_mask(value, current_api_keys.get(key))
    return merged


def _restore_mask(submitted_value: Any, current_value: Any) -> str:
    submitted = str(submitted_value or "")
    current = str(current_value or "")
    if not submitted:
        return submitted
    if placeholder_name(submitted):
        return submitted
    if current and not placeholder_name(current) and submitted == mask_api_key(current):
        return current
    return submitted


def _defaults_payload() -> dict[str, str]:
    defaults = _normalize_defaults(load_config_data().get("defaults") or {})
    if "main_model" not in defaults and defaults.get("main_model_name"):
        defaults["main_model"] = defaults["main_model_name"]
    if "image_gen_model" not in defaults and defaults.get("image_gen_model_name"):
        defaults["image_gen_model"] = defaults["image_gen_model_name"]
    return defaults


def _normalize_defaults(defaults: Any) -> dict[str, str]:
    if defaults is None:
        return {}
    if not isinstance(defaults, dict):
        raise TypeError("defaults must be a mapping")
    return {
        str(key): str(value).strip()
        for key, value in defaults.items()
        if str(value or "").strip()
    }
