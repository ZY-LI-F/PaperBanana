# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Unified generation utilities.

All text / image calls are dispatched through :mod:`utils.provider_registry`.
Model IDs follow the form ``provider_id::model_name`` (legacy bare names are
accepted too — the registry will resolve them).

For backward compatibility a small set of module-level clients
(``gemini_client`` / ``openai_client`` / ``anthropic_client`` /
``openrouter_client``) is still exposed; they are re-populated from the
registry whenever :func:`reinitialize_clients` runs.
"""

from __future__ import annotations

import asyncio
import base64
import os
from typing import Any, Dict, List, Optional

import httpx
from anthropic import AsyncAnthropic
from google import genai
from google.genai import types
from openai import AsyncOpenAI

from utils.provider_registry import (
    Model,
    Provider,
    get_registry,
    reload_registry,
)


# ---------------------------------------------------------------------------
# Module-level clients for backward compat (utils/eval_toolkits.py still uses
# them directly). Repopulated from the registry on every reload.
# ---------------------------------------------------------------------------
gemini_client: Optional[genai.Client] = None
anthropic_client: Optional[AsyncAnthropic] = None
openai_client: Optional[AsyncOpenAI] = None
openrouter_client: Optional[AsyncOpenAI] = None
openrouter_api_key: str = ""


def _pick_first(type_name: str) -> Optional[Provider]:
    reg = get_registry()
    for prov in reg.providers.values():
        if prov.type == type_name and prov.api_key:
            return prov
    return None


def _sync_module_clients() -> List[str]:
    """Refresh the module-level clients from the registry. Returns list of names
    successfully initialized (used for UI feedback)."""
    global gemini_client, anthropic_client, openai_client
    global openrouter_client, openrouter_api_key

    reg = get_registry()
    initialized: List[str] = []

    gem = _pick_first("gemini")
    gemini_client = gem.gemini_client if gem else None
    if gemini_client is not None:
        initialized.append("Gemini")

    ant = _pick_first("anthropic")
    anthropic_client = ant.anthropic_client if ant else None
    if anthropic_client is not None:
        initialized.append("Anthropic")

    # Prefer the provider called "openai-official" as the canonical openai_client;
    # otherwise fall back to any openai-compat provider that points at api.openai.com.
    openai_prov = reg.providers.get("openai-official")
    if openai_prov is None:
        for prov in reg.providers.values():
            if prov.type == "openai" and prov.base_url and "api.openai.com" in prov.base_url and prov.api_key:
                openai_prov = prov
                break
    openai_client = openai_prov.openai_client if openai_prov else None
    if openai_client is not None:
        initialized.append("OpenAI")

    orr = reg.providers.get("openrouter")
    openrouter_client = orr.openai_client if orr else None
    openrouter_api_key = orr.api_key if orr else ""
    if openrouter_client is not None:
        initialized.append("OpenRouter")

    # Also surface any other OpenAI-compat providers (DashScope, DeepSeek, ...)
    for pid, prov in reg.providers.items():
        if pid in {"openai-official", "openrouter"}:
            continue
        if prov.type == "openai" and prov.api_key:
            initialized.append(pid)

    return initialized


def reinitialize_clients() -> List[str]:
    """Reload the registry from disk and rebuild module-level clients."""
    reload_registry()
    return _sync_module_clients()


# Run once at import time.
_sync_module_clients()


# ---------------------------------------------------------------------------
# Content-format converters
# ---------------------------------------------------------------------------
def _convert_to_gemini_parts(contents: List[Dict[str, Any]]) -> List[types.Part]:
    parts: List[types.Part] = []
    for item in contents:
        if item.get("type") == "text":
            parts.append(types.Part.from_text(text=item["text"]))
        elif item.get("type") == "image":
            src = item.get("source", {})
            if src.get("type") == "base64":
                parts.append(types.Part.from_bytes(
                    data=base64.b64decode(src["data"]),
                    mime_type=src["media_type"],
                ))
            elif "image_base64" in item:
                parts.append(types.Part.from_bytes(
                    data=base64.b64decode(item["image_base64"]),
                    mime_type="image/jpeg",
                ))
    return parts


def _convert_to_claude_format(contents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return contents


def _convert_to_openai_format(contents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item in contents:
        if item.get("type") == "text":
            out.append({"type": "text", "text": item["text"]})
        elif item.get("type") == "image":
            src = item.get("source", {})
            if src.get("type") == "base64":
                media_type = src.get("media_type", "image/jpeg")
                data = src.get("data", "")
                out.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{media_type};base64,{data}"},
                })
            elif "image_base64" in item:
                out.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{item['image_base64']}"},
                })
    return out


# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------
async def call_gemini_with_retry_async(
    model_name,
    contents,
    config,
    max_attempts: int = 5,
    retry_delay: int = 5,
    error_context: str = "",
    client: Optional[genai.Client] = None,
):
    """Call Gemini (text or image) with async retry."""
    used_client = client or gemini_client
    if used_client is None:
        raise RuntimeError(
            "Gemini client was not initialized. Configure a provider with "
            "type=gemini in configs/model_config.yaml."
        )

    result_list: List[str] = []
    target_candidate_count = config.candidate_count
    if config.candidate_count > 8:
        config.candidate_count = 8

    current_contents = contents
    is_image_model = "nanoviz" in model_name or "image" in model_name

    for attempt in range(max_attempts):
        try:
            gemini_contents = _convert_to_gemini_parts(current_contents)
            response = await used_client.aio.models.generate_content(
                model=model_name, contents=gemini_contents, config=config
            )

            if is_image_model:
                raw_response_list: List[str] = []
                if not response.candidates or not response.candidates[0].content.parts:
                    print(f"[Warning]: Failed to generate image, retrying in {retry_delay}s...")
                    await asyncio.sleep(retry_delay)
                    continue
                for part in response.candidates[0].content.parts:
                    if part.inline_data:
                        raw_response_list.append(
                            base64.b64encode(part.inline_data.data).decode("utf-8")
                        )
                        break
            else:
                raw_response_list = [
                    part.text
                    for candidate in response.candidates
                    for part in candidate.content.parts
                    if part.text is not None
                ]
            result_list.extend([r for r in raw_response_list if r and r.strip() != ""])
            if len(result_list) >= target_candidate_count:
                result_list = result_list[:target_candidate_count]
                break

        except Exception as e:  # noqa: BLE001
            ctx = f" for {error_context}" if error_context else ""
            current_delay = min(retry_delay * (2 ** attempt), 30)
            print(f"Attempt {attempt + 1} for model {model_name} failed{ctx}: {e}. Retrying in {current_delay}s...")
            if attempt < max_attempts - 1:
                await asyncio.sleep(current_delay)
            else:
                print(f"Error: All {max_attempts} attempts failed{ctx}")
                result_list = ["Error"] * target_candidate_count

    if len(result_list) < target_candidate_count:
        result_list.extend(["Error"] * (target_candidate_count - len(result_list)))
    return result_list


# ---------------------------------------------------------------------------
# Claude / Anthropic
# ---------------------------------------------------------------------------
async def call_claude_with_retry_async(
    model_name,
    contents,
    config,
    max_attempts: int = 5,
    retry_delay: int = 30,
    error_context: str = "",
    client: Optional[AsyncAnthropic] = None,
):
    used_client = client or anthropic_client
    if used_client is None:
        raise RuntimeError("Anthropic client not initialized.")

    system_prompt = config["system_prompt"]
    temperature = config["temperature"]
    candidate_num = config["candidate_num"]
    max_output_tokens = config["max_output_tokens"]
    response_text_list: List[str] = []

    current_contents = contents
    is_input_valid = False
    for attempt in range(max_attempts):
        try:
            claude_contents = _convert_to_claude_format(current_contents)
            first_response = await used_client.messages.create(
                model=model_name,
                max_tokens=max_output_tokens,
                temperature=temperature,
                messages=[{"role": "user", "content": claude_contents}],
                system=system_prompt,
            )
            response_text_list.append(first_response.content[0].text)
            is_input_valid = True
            break
        except Exception as e:  # noqa: BLE001
            ctx = f" for {error_context}" if error_context else ""
            print(f"Validation attempt {attempt + 1} failed{ctx}: {e}. Retrying in {retry_delay}s...")
            if attempt < max_attempts - 1:
                await asyncio.sleep(retry_delay)

    if not is_input_valid:
        return ["Error"] * candidate_num

    remaining = candidate_num - 1
    if remaining > 0:
        tasks = [
            used_client.messages.create(
                model=model_name,
                max_tokens=max_output_tokens,
                temperature=temperature,
                messages=[{"role": "user", "content": _convert_to_claude_format(current_contents)}],
                system=system_prompt,
            )
            for _ in range(remaining)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, Exception):
                print(f"Error generating subsequent candidate: {res}")
                response_text_list.append("Error")
            else:
                response_text_list.append(res.content[0].text)
    return response_text_list


# ---------------------------------------------------------------------------
# OpenAI-compatible chat (OpenAI, DashScope, DeepSeek, OpenRouter, ...)
# ---------------------------------------------------------------------------
async def _openai_stream_collect(used_client, payload: Dict[str, Any]) -> str:
    """Open a stream and accumulate message content. Silently drops
    ``reasoning_content`` deltas (Qwen / DeepSeek thinking models)."""
    stream = await used_client.chat.completions.create(**payload, stream=True)
    full_content = ""
    try:
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            piece = getattr(delta, "content", None)
            if piece:
                full_content += piece
    finally:
        close = getattr(stream, "close", None)
        if callable(close):
            try:
                await close()
            except Exception:
                pass
    return full_content


async def call_openai_with_retry_async(
    model_name,
    contents,
    config,
    max_attempts: int = 5,
    retry_delay: int = 30,
    error_context: str = "",
    client: Optional[AsyncOpenAI] = None,
    extra_body: Optional[Dict[str, Any]] = None,
    streaming: bool = False,
):
    used_client = client or openai_client
    if used_client is None:
        raise RuntimeError("OpenAI-compatible client not initialized.")

    system_prompt = config["system_prompt"]
    temperature = config["temperature"]
    candidate_num = config["candidate_num"]
    max_completion_tokens = config["max_completion_tokens"]
    response_text_list: List[str] = []

    def _build_payload(messages):
        payload: Dict[str, Any] = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_completion_tokens": max_completion_tokens,
        }
        if extra_body:
            payload["extra_body"] = extra_body
        return payload

    is_input_valid = False
    for attempt in range(max_attempts):
        try:
            openai_contents = _convert_to_openai_format(contents)
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": openai_contents},
            ]
            if streaming:
                content = await _openai_stream_collect(used_client, _build_payload(messages))
            else:
                first_response = await used_client.chat.completions.create(**_build_payload(messages))
                content = first_response.choices[0].message.content or ""

            if not content.strip():
                print("OpenAI-compat returned empty content, retrying...")
                if attempt < max_attempts - 1:
                    await asyncio.sleep(retry_delay)
                continue
            response_text_list.append(content)
            is_input_valid = True
            break
        except Exception as e:  # noqa: BLE001
            ctx = f" for {error_context}" if error_context else ""
            status = getattr(e, "status_code", None) or getattr(getattr(e, "response", None), "status_code", None)
            print(f"Validation attempt {attempt + 1} failed{ctx}: {e}. Retrying in {retry_delay}s...")
            # Hard-fail on auth / quota / malformed-request errors — retrying won't help.
            if status in (400, 401, 403, 404):
                print(f"[openai_chat] giving up early due to HTTP {status} (auth/quota/malformed).")
                return ["Error"] * candidate_num
            if attempt < max_attempts - 1:
                await asyncio.sleep(retry_delay)

    if not is_input_valid:
        return ["Error"] * candidate_num

    remaining = candidate_num - 1
    if remaining > 0:
        valid = _convert_to_openai_format(contents)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": valid},
        ]
        if streaming:
            async def _one():
                try:
                    return await _openai_stream_collect(used_client, _build_payload(messages))
                except Exception as e:
                    return e
            results = await asyncio.gather(*[_one() for _ in range(remaining)])
            for res in results:
                if isinstance(res, Exception):
                    print(f"Error generating subsequent candidate: {res}")
                    response_text_list.append("Error")
                else:
                    response_text_list.append(res or "Error")
        else:
            tasks = [
                used_client.chat.completions.create(**_build_payload(messages))
                for _ in range(remaining)
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for res in results:
                if isinstance(res, Exception):
                    print(f"Error generating subsequent candidate: {res}")
                    response_text_list.append("Error")
                else:
                    response_text_list.append(res.choices[0].message.content or "Error")

    return response_text_list


# ---------------------------------------------------------------------------
# OpenAI Images endpoint (/v1/images/generations) — OpenAI, DashScope wanx, ...
# ---------------------------------------------------------------------------
async def call_openai_image_generation_with_retry_async(
    model_name,
    prompt,
    config,
    max_attempts: int = 5,
    retry_delay: int = 30,
    error_context: str = "",
    client: Optional[AsyncOpenAI] = None,
):
    used_client = client or openai_client
    if used_client is None:
        raise RuntimeError("OpenAI-compatible client not initialized for image generation.")

    size = config.get("size", "1536x1024")
    quality = config.get("quality", "high")
    background = config.get("background", "opaque")
    output_format = config.get("output_format", "png")

    gen_params: Dict[str, Any] = {
        "model": model_name,
        "prompt": prompt,
        "n": 1,
        "size": size,
    }
    gen_params.update({
        "quality": quality,
        "background": background,
        "output_format": output_format,
    })

    for attempt in range(max_attempts):
        try:
            response = await used_client.images.generate(**gen_params)
            if response.data and response.data[0].b64_json:
                return [response.data[0].b64_json]
            print("[Warning]: image generation returned no data.")
            if attempt < max_attempts - 1:
                await asyncio.sleep(retry_delay)
        except Exception as e:  # noqa: BLE001
            ctx = f" for {error_context}" if error_context else ""
            print(f"Attempt {attempt + 1} image gen ({model_name}) failed{ctx}: {e}. Retrying in {retry_delay}s...")
            if attempt < max_attempts - 1:
                await asyncio.sleep(retry_delay)
            else:
                print(f"Error: All {max_attempts} attempts failed{ctx}")
                return ["Error"]
    return ["Error"]


# ---------------------------------------------------------------------------
# Chat-endpoint image generation (OpenRouter, some DashScope VL models, ...)
# POST /chat/completions with modalities=["image","text"].
# ---------------------------------------------------------------------------
async def call_openai_chat_modalities_image_with_retry_async(
    model_name,
    contents,
    config,
    max_attempts: int = 5,
    retry_delay: int = 30,
    error_context: str = "",
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
):
    used_base_url = base_url or (openrouter_client.base_url if openrouter_client else None)
    used_api_key = api_key or openrouter_api_key
    if not used_base_url or not used_api_key:
        raise RuntimeError("base_url/api_key required for chat-modalities image generation.")

    system_prompt = config.get("system_prompt", "")
    temperature = config.get("temperature", 1.0)
    aspect_ratio = config.get("aspect_ratio", "1:1")
    image_size = config.get("image_size", "1k")

    openai_contents = _convert_to_openai_format(contents)
    image_config: Dict[str, Any] = {}
    if aspect_ratio:
        image_config["aspect_ratio"] = aspect_ratio
    if image_size:
        image_config["image_size"] = image_size

    payload: Dict[str, Any] = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": openai_contents},
        ],
        "temperature": temperature,
        "modalities": ["image", "text"],
    }
    if image_config:
        payload["image_config"] = image_config

    headers = {
        "Authorization": f"Bearer {used_api_key}",
        "Content-Type": "application/json",
    }

    base_url_str = str(used_base_url).rstrip("/")
    url = f"{base_url_str}/chat/completions"

    for attempt in range(max_attempts):
        try:
            async with httpx.AsyncClient(timeout=300) as hclient:
                resp = await hclient.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

            choices = data.get("choices", [])
            if not choices:
                print("[Warning]: chat-modalities image returned no choices.")
                if attempt < max_attempts - 1:
                    await asyncio.sleep(retry_delay)
                continue

            message = choices[0].get("message", {})
            content = message.get("content")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and "inline_data" in part:
                        b64_data = part["inline_data"].get("data", "")
                        if b64_data:
                            return [b64_data]

            images = message.get("images")
            if images:
                img_item = images[0]
                if isinstance(img_item, dict):
                    data_url = img_item.get("image_url", {}).get("url", "")
                else:
                    data_url = str(img_item)
                b64_data = data_url.split(",", 1)[1] if "," in data_url else data_url
                if b64_data:
                    return [b64_data]

            if isinstance(content, str) and content.startswith("data:image") and "," in content:
                return [content.split(",", 1)[1]]

            print("[Warning]: chat-modalities image returned no inline image data.")
            if attempt < max_attempts - 1:
                await asyncio.sleep(retry_delay)
        except httpx.HTTPStatusError as e:
            ctx = f" for {error_context}" if error_context else ""
            current_delay = min(retry_delay * (2 ** attempt), 60)
            print(f"chat-modalities attempt {attempt + 1} failed{ctx}: HTTP {e.response.status_code} - {e.response.text}. Retrying in {current_delay}s...")
            if attempt < max_attempts - 1:
                await asyncio.sleep(current_delay)
            else:
                return ["Error"]
        except Exception as e:  # noqa: BLE001
            ctx = f" for {error_context}" if error_context else ""
            current_delay = min(retry_delay * (2 ** attempt), 60)
            print(f"chat-modalities attempt {attempt + 1} failed{ctx}: {e}. Retrying in {current_delay}s...")
            if attempt < max_attempts - 1:
                await asyncio.sleep(current_delay)
            else:
                return ["Error"]

    return ["Error"]


# ---------------------------------------------------------------------------
# DashScope native multimodal image generation / editing
# Endpoint: {base}/api/v1/services/aigc/multimodal-generation/generation
# Used by qwen-image-2.0*, qwen-image-edit*, etc. Returns an image URL that we
# download and base64-encode so downstream agents see the usual format.
# ---------------------------------------------------------------------------

# Client-side throttle: DashScope multimodal image endpoints are QPS-limited
# (default ~2 QPS). With 10 concurrent candidates everyone collides on 429.
# Keep the semaphore small so requests queue instead of storming the endpoint.
_DASHSCOPE_MM_SEM: Optional[asyncio.Semaphore] = None
_DASHSCOPE_MM_CONCURRENCY = int(os.environ.get("DASHSCOPE_MM_CONCURRENCY", "2"))


def _get_dashscope_mm_sem() -> asyncio.Semaphore:
    global _DASHSCOPE_MM_SEM
    if _DASHSCOPE_MM_SEM is None:
        _DASHSCOPE_MM_SEM = asyncio.Semaphore(_DASHSCOPE_MM_CONCURRENCY)
    return _DASHSCOPE_MM_SEM


async def call_dashscope_multimodal_image_with_retry_async(
    model_name,
    contents,
    config,
    max_attempts: int = 5,
    retry_delay: int = 30,
    error_context: str = "",
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
):
    if not api_key:
        raise RuntimeError("DashScope API key required for qwen-image models.")

    if base_url:
        endpoint = str(base_url).rstrip("/")
        if endpoint.endswith("/compatible-mode/v1"):
            endpoint = endpoint[: -len("/compatible-mode/v1")] + "/api/v1"
        elif not endpoint.endswith("/api/v1"):
            endpoint = endpoint + "/api/v1"
    else:
        endpoint = "https://dashscope.aliyuncs.com/api/v1"
    url = f"{endpoint}/services/aigc/multimodal-generation/generation"

    dash_content: List[Dict[str, Any]] = []
    text_segment: Optional[str] = None
    for item in contents or []:
        if item.get("type") == "text":
            # DashScope expects a single text segment; concatenate if multiple are supplied.
            text_segment = (text_segment + "\n" if text_segment else "") + item.get("text", "")
        elif item.get("type") == "image":
            src = item.get("source", {})
            if src.get("type") == "base64":
                media = src.get("media_type", "image/png")
                data = src.get("data", "")
                dash_content.append({"image": f"data:{media};base64,{data}"})
            elif "image_base64" in item:
                dash_content.append({"image": f"data:image/jpeg;base64,{item['image_base64']}"})
            elif src.get("type") == "url" and src.get("url"):
                dash_content.append({"image": src["url"]})
        elif isinstance(item, dict) and "image" in item and item.get("type") is None:
            dash_content.append({"image": item["image"]})

    if text_segment is None:
        text_segment = config.get("prompt", "")
    dash_content.append({"text": text_segment})

    size = config.get("size", "1024*1024")
    if isinstance(size, str) and "x" in size and "*" not in size:
        size = size.replace("x", "*")

    if model_name == "qwen-image-edit":
        # qwen-image-edit only accepts n & watermark.
        parameters: Dict[str, Any] = {
            "n": 1,
            "watermark": config.get("watermark", False),
        }
    else:
        parameters = {
            "n": config.get("n", 1),
            "negative_prompt": config.get("negative_prompt", " "),
            "prompt_extend": config.get("prompt_extend", True),
            "watermark": config.get("watermark", False),
            "size": size,
        }
        if config.get("seed") is not None:
            parameters["seed"] = config["seed"]

    payload = {
        "model": model_name,
        "input": {"messages": [{"role": "user", "content": dash_content}]},
        "parameters": parameters,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    sem = _get_dashscope_mm_sem()
    for attempt in range(max_attempts):
        try:
            async with sem:
                async with httpx.AsyncClient(timeout=600) as hclient:
                    resp = await hclient.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if "code" in data and data.get("code"):
                raise RuntimeError(f"DashScope error {data.get('code')}: {data.get('message')}")

            choices = (data.get("output") or {}).get("choices") or []
            if not choices:
                raise RuntimeError(f"No choices in DashScope response: {data}")
            msg_content = choices[0].get("message", {}).get("content", []) or []
            image_url: Optional[str] = None
            for seg in msg_content:
                if isinstance(seg, dict) and seg.get("image"):
                    image_url = seg["image"]
                    break
            if not image_url:
                raise RuntimeError(f"No image URL in DashScope output: {data}")

            async with httpx.AsyncClient(timeout=300) as hclient:
                img_resp = await hclient.get(image_url)
            img_resp.raise_for_status()
            return [base64.b64encode(img_resp.content).decode("utf-8")]
        except httpx.HTTPStatusError as e:
            body = ""
            try:
                body = e.response.text[:800]
            except Exception:
                pass
            ctx = f" for {error_context}" if error_context else ""
            # Honor Retry-After header when present; else exponential backoff.
            retry_after = e.response.headers.get("Retry-After") if e.response is not None else None
            try:
                current_delay = int(retry_after) if retry_after else min(retry_delay * (2 ** attempt), 60)
            except (TypeError, ValueError):
                current_delay = min(retry_delay * (2 ** attempt), 60)
            print(
                f"DashScope multimodal attempt {attempt + 1} for {model_name} failed{ctx}: "
                f"HTTP {e.response.status_code} body={body!r}. Retrying in {current_delay}s..."
            )
            # 400 means the request is malformed for this model — retrying won't help.
            if e.response.status_code == 400:
                return ["Error"]
            if attempt < max_attempts - 1:
                await asyncio.sleep(current_delay)
            else:
                return ["Error"]
        except Exception as e:  # noqa: BLE001
            ctx = f" for {error_context}" if error_context else ""
            current_delay = min(retry_delay * (2 ** attempt), 60)
            print(f"DashScope multimodal attempt {attempt + 1} for {model_name} failed{ctx}: {e}. Retrying in {current_delay}s...")
            if attempt < max_attempts - 1:
                await asyncio.sleep(current_delay)
            else:
                return ["Error"]
    return ["Error"]


# Legacy alias (kept because app.py / demo.py still import this name directly).
async def call_openrouter_image_generation_with_retry_async(
    model_name,
    contents,
    config,
    max_attempts: int = 5,
    retry_delay: int = 30,
    error_context: str = "",
):
    base_url = None
    api_key = None
    orr = get_registry().providers.get("openrouter")
    if orr:
        base_url = orr.base_url
        api_key = orr.api_key
    return await call_openai_chat_modalities_image_with_retry_async(
        model_name=model_name,
        contents=contents,
        config=config,
        max_attempts=max_attempts,
        retry_delay=retry_delay,
        error_context=error_context,
        base_url=base_url,
        api_key=api_key,
    )


# ---------------------------------------------------------------------------
# OpenRouter chat (OpenAI-compatible). Kept for code-path symmetry.
# ---------------------------------------------------------------------------
async def call_openrouter_with_retry_async(
    model_name,
    contents,
    config,
    max_attempts: int = 5,
    retry_delay: int = 30,
    error_context: str = "",
):
    if openrouter_client is None:
        raise RuntimeError("OpenRouter client not initialized.")
    return await call_openai_with_retry_async(
        model_name=_to_openrouter_model_id(model_name),
        contents=contents,
        config=config,
        max_attempts=max_attempts,
        retry_delay=retry_delay,
        error_context=error_context,
        client=openrouter_client,
    )


def _to_openrouter_model_id(model_name: str) -> str:
    if "/" in model_name:
        return model_name
    if model_name.startswith("gemini"):
        return f"google/{model_name}"
    return model_name


# ---------------------------------------------------------------------------
# Unified routers (registry-driven)
# ---------------------------------------------------------------------------
def _cfg_to_openai_dict(config) -> Dict[str, Any]:
    return {
        "system_prompt": getattr(config, "system_instruction", "") or "",
        "temperature": getattr(config, "temperature", 1.0),
        "candidate_num": getattr(config, "candidate_count", 1) or 1,
        "max_completion_tokens": getattr(config, "max_output_tokens", 50000) or 50000,
    }


async def call_model_with_retry_async(
    model_name,
    contents,
    config,
    max_attempts: int = 5,
    retry_delay: int = 5,
    error_context: str = "",
):
    """Unified text-generation router. Dispatches by provider/invoke."""
    reg = get_registry()
    try:
        prov, model = reg.resolve(model_name)
    except ValueError:
        # Legacy fallback: preserve the old prefix-based routing so existing
        # bare model names keep working even if the registry is empty.
        return await _legacy_call_model(model_name, contents, config, max_attempts, retry_delay, error_context)

    if model.invoke == "gemini_native":
        return await call_gemini_with_retry_async(
            model_name=model.name,
            contents=contents,
            config=config,
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
            client=prov.gemini_client,
        )

    cfg_dict = _cfg_to_openai_dict(config)

    if model.invoke == "anthropic":
        return await call_claude_with_retry_async(
            model_name=model.name,
            contents=contents,
            config=cfg_dict,
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
            client=prov.anthropic_client,
        )

    # openai_chat is the default for everything else (OpenAI, DashScope, DeepSeek, OpenRouter, ...).
    return await call_openai_with_retry_async(
        model_name=model.name,
        contents=contents,
        config=cfg_dict,
        max_attempts=max_attempts,
        retry_delay=retry_delay,
        error_context=error_context,
        client=prov.openai_client,
        extra_body=model.params.get("extra_body") if model.params else None,
        streaming=bool(model.params.get("streaming")) if model.params else False,
    )


async def call_image_gen_with_retry_async(
    model_name,
    contents: Optional[List[Dict[str, Any]]] = None,
    prompt: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
    max_attempts: int = 5,
    retry_delay: int = 30,
    error_context: str = "",
):
    """Unified image-generation router.

    ``contents`` is the Claude/PaperBanana-style list (text + images). ``prompt``
    is a convenience string; when omitted the first text segment of ``contents``
    is used.
    """
    cfg = dict(config or {})
    reg = get_registry()
    prov, model = reg.resolve(model_name)

    if contents is None and prompt is None:
        raise ValueError("Provide either contents or prompt.")
    if contents is None:
        contents = [{"type": "text", "text": prompt}]
    if prompt is None:
        for c in contents:
            if c.get("type") == "text":
                prompt = c.get("text", "")
                break
        prompt = prompt or ""

    invoke = model.invoke

    if invoke == "gemini_native":
        aspect_ratio = cfg.get("aspect_ratio", "1:1")
        image_size = cfg.get("image_size", "1k")
        gen_config = types.GenerateContentConfig(
            system_instruction=cfg.get("system_prompt", ""),
            temperature=cfg.get("temperature", 1.0),
            candidate_count=1,
            max_output_tokens=cfg.get("max_output_tokens", 50000),
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size=image_size,
            ),
        )
        return await call_gemini_with_retry_async(
            model_name=model.name,
            contents=contents,
            config=gen_config,
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
            client=prov.gemini_client,
        )

    if invoke == "openai_images":
        image_cfg = {
            "size": cfg.get("size", "1536x1024"),
            "quality": cfg.get("quality", "high"),
            "background": cfg.get("background", "opaque"),
            "output_format": cfg.get("output_format", "png"),
        }
        return await call_openai_image_generation_with_retry_async(
            model_name=model.name,
            prompt=prompt,
            config=image_cfg,
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
            client=prov.openai_client,
        )

    if invoke == "openai_chat_modalities":
        return await call_openai_chat_modalities_image_with_retry_async(
            model_name=model.name,
            contents=contents,
            config=cfg,
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
            base_url=str(prov.base_url) if prov.base_url else None,
            api_key=prov.api_key,
        )

    if invoke == "dashscope_multimodal":
        return await call_dashscope_multimodal_image_with_retry_async(
            model_name=model.name,
            contents=contents,
            config=cfg,
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
            api_key=prov.api_key,
            base_url=str(prov.base_url) if prov.base_url else None,
        )

    raise ValueError(
        f"Model '{model.id}' has invoke='{invoke}' which is not supported for image generation. "
        f"Expected one of: gemini_native, openai_images, openai_chat_modalities, dashscope_multimodal."
    )


# ---------------------------------------------------------------------------
# Legacy fallback used only when the registry can't resolve a bare model name.
# ---------------------------------------------------------------------------
async def _legacy_call_model(model_name, contents, config, max_attempts, retry_delay, error_context):
    if model_name.startswith("openrouter/"):
        return await call_openrouter_with_retry_async(
            model_name=model_name[len("openrouter/"):],
            contents=contents,
            config=_cfg_to_openai_dict(config),
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
        )
    if model_name.startswith("claude-"):
        return await call_claude_with_retry_async(
            model_name=model_name,
            contents=contents,
            config=_cfg_to_openai_dict(config),
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
        )
    if any(model_name.startswith(p) for p in ("gpt-", "o1-", "o3-", "o4-")):
        return await call_openai_with_retry_async(
            model_name=model_name,
            contents=contents,
            config=_cfg_to_openai_dict(config),
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
        )
    if gemini_client is not None:
        return await call_gemini_with_retry_async(
            model_name=model_name,
            contents=contents,
            config=config,
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
        )
    if openrouter_client is not None:
        return await call_openrouter_with_retry_async(
            model_name=model_name,
            contents=contents,
            config=_cfg_to_openai_dict(config),
            max_attempts=max_attempts,
            retry_delay=retry_delay,
            error_context=error_context,
        )
    raise RuntimeError("No API client available. Configure a provider in configs/model_config.yaml.")
