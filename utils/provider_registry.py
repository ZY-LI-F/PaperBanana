# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Provider / model registry.

Supports a new YAML schema with multiple providers, each declaring its own
API key, base_url and model list. Also falls back to the legacy
``api_keys + defaults`` schema so existing config files keep working.

A model is addressed globally as ``provider_id::model_name``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from anthropic import AsyncAnthropic
from google import genai
from openai import AsyncOpenAI


CONFIG_PATH = Path(__file__).parent.parent / "configs" / "model_config.yaml"
_ENV_PATH = Path(__file__).parent.parent / ".env"

# Load project-root .env so configs/model_config.yaml's ${VAR} references resolve
# without forcing every entry point (app.py / main.py / demo.py) to remember to
# call load_dotenv. Existing process env wins (override=False).
try:
    from dotenv import load_dotenv as _load_dotenv
    if _ENV_PATH.exists():
        _load_dotenv(_ENV_PATH, override=False)
except ImportError:
    # Manual fallback so the project still works if python-dotenv isn't installed.
    if _ENV_PATH.exists():
        for _line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))


# Well-known providers get a default base_url and type inference when the YAML
# omits them. Users can still override everything explicitly.
PROVIDER_PRESETS: Dict[str, Dict[str, str]] = {
    "openai-official": {"type": "openai", "base_url": "https://api.openai.com/v1"},
    "anthropic-official": {"type": "anthropic"},
    "gemini-official": {"type": "gemini"},
    "openrouter": {"type": "openai", "base_url": "https://openrouter.ai/api/v1"},
    "dashscope": {"type": "openai", "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    "deepseek": {"type": "openai", "base_url": "https://api.deepseek.com"},
    "moonshot": {"type": "openai", "base_url": "https://api.moonshot.cn/v1"},
    "zhipu": {"type": "openai", "base_url": "https://open.bigmodel.cn/api/paas/v4"},
    "siliconflow": {"type": "openai", "base_url": "https://api.siliconflow.cn/v1"},
    "ollama": {"type": "openai", "base_url": "http://localhost:11434/v1"},
}


@dataclass
class Model:
    provider_id: str
    name: str
    capability: str = "chat"      # "chat" | "image"
    invoke: str = "openai_chat"   # see _default_invoke for valid values
    label: str = ""
    # Per-model parameters passed through to the provider SDK. Common keys:
    #   streaming: bool   -- use stream=True (required for Qwen thinking models)
    #   extra_body: dict  -- passed as OpenAI SDK's extra_body (e.g. enable_thinking)
    params: Dict[str, Any] = field(default_factory=dict)

    @property
    def id(self) -> str:
        return f"{self.provider_id}::{self.name}"


@dataclass
class Provider:
    id: str
    type: str                     # "openai" | "gemini" | "anthropic"
    api_key: str = ""
    base_url: Optional[str] = None
    models: List[Model] = field(default_factory=list)

    openai_client: Optional[AsyncOpenAI] = None
    gemini_client: Optional[genai.Client] = None
    anthropic_client: Optional[AsyncAnthropic] = None

    def build_clients(self) -> None:
        self.openai_client = None
        self.gemini_client = None
        self.anthropic_client = None
        if not self.api_key:
            return
        if self.type == "openai":
            self.openai_client = (
                AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
                if self.base_url
                else AsyncOpenAI(api_key=self.api_key)
            )
        elif self.type == "gemini":
            self.gemini_client = genai.Client(api_key=self.api_key)
        elif self.type == "anthropic":
            self.anthropic_client = AsyncAnthropic(api_key=self.api_key)


class Registry:
    def __init__(self) -> None:
        self.providers: Dict[str, Provider] = {}
        self._default_main: Optional[str] = None
        self._default_image: Optional[str] = None

    # ---- loading ----
    def load_from_file(self, path: Path = CONFIG_PATH) -> None:
        data: Dict[str, Any] = {}
        if path.exists():
            with open(path, "r", encoding="utf-8-sig") as f:
                data = yaml.safe_load(f) or {}
        self.load_from_dict(data)

    def load_from_dict(self, data: Dict[str, Any]) -> None:
        self.providers.clear()
        providers_cfg = data.get("providers")
        if not providers_cfg:
            providers_cfg = self._legacy_to_new(data)

        for p in providers_cfg or []:
            pid = p.get("id")
            if not pid:
                continue
            preset = PROVIDER_PRESETS.get(pid, {})
            ptype = p.get("type") or preset.get("type") or "openai"
            api_key = _resolve_env(p.get("api_key", ""))
            base_url = p.get("base_url") or preset.get("base_url")

            prov = Provider(id=pid, type=ptype, api_key=api_key, base_url=base_url)

            for m in p.get("models", []):
                if isinstance(m, str):
                    m = {"name": m}
                name = m.get("name")
                if not name:
                    continue
                capability = m.get("capability") or _guess_capability(name)
                invoke = m.get("invoke") or _default_invoke(ptype, capability)
                label = m.get("label") or f"{pid} / {name}"
                params = m.get("params", {}) or {}
                prov.models.append(
                    Model(
                        provider_id=pid,
                        name=name,
                        capability=capability,
                        invoke=invoke,
                        label=label,
                        params=params,
                    )
                )
            prov.build_clients()
            self.providers[pid] = prov

        defaults = data.get("defaults", {}) or {}
        self._default_main = defaults.get("main_model") or defaults.get("main_model_name")
        self._default_image = defaults.get("image_gen_model") or defaults.get("image_gen_model_name")

    def _legacy_to_new(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        api_keys = data.get("api_keys", {}) or {}
        defaults = data.get("defaults", {}) or {}
        main_model = defaults.get("main_model_name", "")
        image_model = defaults.get("image_gen_model_name", "")
        result: List[Dict[str, Any]] = []

        g_key = api_keys.get("google_api_key") or os.environ.get("GOOGLE_API_KEY", "")
        if g_key:
            models: List[Dict[str, Any]] = []
            if main_model and "image" not in main_model and "nanoviz" not in main_model:
                models.append({"name": main_model, "capability": "chat"})
            if image_model:
                models.append({"name": image_model, "capability": "image"})
            if not models:
                models = [
                    {"name": "gemini-3.1-pro-preview", "capability": "chat"},
                    {"name": "gemini-3.1-flash-image-preview", "capability": "image"},
                ]
            result.append({"id": "gemini-official", "type": "gemini", "api_key": g_key, "models": models})

        o_key = api_keys.get("openai_api_key") or os.environ.get("OPENAI_API_KEY", "")
        if o_key:
            result.append({
                "id": "openai-official",
                "type": "openai",
                "base_url": "https://api.openai.com/v1",
                "api_key": o_key,
                "models": [
                    {"name": "gpt-4.1", "capability": "chat"},
                    {"name": "gpt-image-1", "capability": "image", "invoke": "openai_images"},
                ],
            })

        a_key = api_keys.get("anthropic_api_key") or os.environ.get("ANTHROPIC_API_KEY", "")
        if a_key:
            result.append({
                "id": "anthropic-official",
                "type": "anthropic",
                "api_key": a_key,
                "models": [{"name": "claude-sonnet-4-5", "capability": "chat"}],
            })

        or_key = api_keys.get("openrouter_api_key") or os.environ.get("OPENROUTER_API_KEY", "")
        if or_key:
            models = []
            if main_model:
                models.append({"name": main_model, "capability": "chat"})
            if image_model:
                models.append({"name": image_model, "capability": "image", "invoke": "openai_chat_modalities"})
            if not models:
                models = [{"name": "google/gemini-3-pro-preview", "capability": "chat"}]
            result.append({
                "id": "openrouter",
                "type": "openai",
                "base_url": "https://openrouter.ai/api/v1",
                "api_key": or_key,
                "models": models,
            })

        return result

    # ---- queries ----
    def list_chat_models(self) -> List[Model]:
        return [m for p in self.providers.values() for m in p.models if m.capability == "chat"]

    def list_image_models(self) -> List[Model]:
        return [m for p in self.providers.values() for m in p.models if m.capability == "image"]

    def resolve(self, model_id: str) -> Tuple[Provider, Model]:
        """Return (provider, model) for ``provider_id::model_name`` or a bare name."""
        if "::" in model_id:
            pid, mname = model_id.split("::", 1)
            prov = self.providers.get(pid)
            if prov is None:
                raise ValueError(f"Unknown provider id: {pid}. Configured: {list(self.providers)}")
            for m in prov.models:
                if m.name == mname:
                    return prov, m
            # Ad-hoc model not listed in YAML: accept it using provider defaults.
            capability = _guess_capability(mname)
            return prov, Model(
                provider_id=pid,
                name=mname,
                capability=capability,
                invoke=_default_invoke(prov.type, capability),
                label=mname,
            )

        for prov in self.providers.values():
            for m in prov.models:
                if m.name == model_id:
                    return prov, m
        raise ValueError(
            f"Model not found: '{model_id}'. Use the form 'provider_id::model_name' "
            f"or add it to configs/model_config.yaml. Known providers: {list(self.providers)}"
        )

    def _normalize(self, raw: Optional[str], capability: str) -> str:
        """Turn a bare model name into a provider::model id if possible."""
        if not raw:
            return ""
        if "::" in raw:
            return raw
        for prov in self.providers.values():
            for m in prov.models:
                if m.name == raw and m.capability == capability:
                    return m.id
        return raw

    def default_main(self) -> str:
        normalized = self._normalize(self._default_main, "chat")
        if normalized:
            return normalized
        models = self.list_chat_models()
        return models[0].id if models else ""

    def default_image(self) -> str:
        normalized = self._normalize(self._default_image, "image")
        if normalized:
            return normalized
        models = self.list_image_models()
        return models[0].id if models else ""

    def describe(self) -> List[str]:
        lines = []
        for p in self.providers.values():
            flag = "ok" if p.api_key else "NO KEY"
            lines.append(f"[{flag}] {p.id} ({p.type}) -> {p.base_url or 'native SDK'}")
            for m in p.models:
                lines.append(f"    - {m.id}  [{m.capability}/{m.invoke}]")
        return lines


def _resolve_env(val: Any) -> str:
    if not val:
        return ""
    if isinstance(val, str) and val.startswith("${") and val.endswith("}"):
        return os.environ.get(val[2:-1], "")
    return str(val)


def _default_invoke(ptype: str, capability: str) -> str:
    if ptype == "gemini":
        return "gemini_native"
    if ptype == "anthropic":
        return "anthropic"
    if ptype == "openai":
        return "openai_images" if capability == "image" else "openai_chat"
    return "openai_chat"


def _guess_capability(name: str) -> str:
    lower = name.lower()
    if any(k in lower for k in ("image", "nanoviz", "wanx", "wan-", "dalle", "dall-e", "sdxl", "flux", "cogview", "kolors")):
        return "image"
    return "chat"


_registry = Registry()


def get_registry() -> Registry:
    return _registry


def reload_registry(data: Optional[Dict[str, Any]] = None) -> Registry:
    """Reload the registry from a dict or from the on-disk YAML."""
    if data is not None:
        _registry.load_from_dict(data)
    else:
        _registry.load_from_file()
    return _registry


try:
    _registry.load_from_file()
except Exception as exc:  # noqa: BLE001
    print(f"[provider_registry] warning: failed to load config: {exc}")
