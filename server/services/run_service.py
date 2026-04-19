from __future__ import annotations

import asyncio
import base64
import io
import json
import shutil
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

import server.settings as settings
from server.repos import battle_repo, runs_repo
from server.repos.battle_repo import BattleRunRow
from server.repos.runs_repo import RunRow, StageRow
from server.services import config_service
from server.services.log_bus import log_bus
from server.stage_plan import StageSpec, battle_shared_plan, stage_names_until, stage_plan
from utils.config import ExpConfig


MAX_OUTPUT_TOKENS = 8192
_RUNTIME: dict[str, "_RunControl"] = {}
_LOCK = threading.Lock()


@dataclass(frozen=True)
class GenerateParams:
    method_content: str
    caption: str
    exp_mode: str
    main_model: str = ""
    image_model: str = ""
    retrieval_setting: str = "auto"
    num_candidates: int = 1
    aspect_ratio: str = "16:9"
    figure_size: str | None = None
    figure_language: str | None = None
    max_critic_rounds: int = 3


@dataclass(frozen=True)
class RefineParams:
    image_bytes: bytes
    edit_prompt: str
    image_model: str = ""
    aspect_ratio: str = "21:9"
    image_size: str = "2K"


@dataclass
class _RunControl:
    kind: str
    params: GenerateParams | RefineParams
    image_models: tuple[str, ...] = ()
    cancel_event: threading.Event = field(default_factory=threading.Event)


def start_generate(params: GenerateParams) -> str:
    exp_config = _build_exp_config(params)
    _resolve_model(exp_config.main_model_name)
    _resolve_model(exp_config.image_gen_model_name)
    row = _build_run_row(kind="generate", params=params, exp_config=exp_config, image_model=exp_config.image_gen_model_name)
    return _create_and_launch(row, _RunControl(kind="generate", params=params, cancel_event=threading.Event()))


def start_battle(params: GenerateParams, image_models: list[str]) -> str:
    if not image_models:
        raise ValueError("image_models must not be empty")
    exp_config = _build_exp_config(params)
    _resolve_model(exp_config.main_model_name)
    for model_id in image_models:
        _resolve_model(model_id)
    row = _build_run_row(kind="battle", params=params, exp_config=exp_config, image_model=image_models[0])
    control = _RunControl(
        kind="battle",
        params=params,
        image_models=tuple(image_models),
        cancel_event=threading.Event(),
    )
    return _create_and_launch(row, control)


def start_refine(params: RefineParams) -> str:
    exp_config = _build_refine_config(params)
    _resolve_model(exp_config.image_gen_model_name)
    row = _build_refine_row(params, exp_config)
    run_id = _create_and_launch(
        row,
        _RunControl(kind="refine", params=params, cancel_event=threading.Event()),
        start_now=False,
    )
    input_path = _run_dir(run_id) / "input" / "source.png"
    input_path.parent.mkdir(parents=True, exist_ok=True)
    input_path.write_bytes(params.image_bytes)
    _launch(run_id)
    return run_id


def cancel(run_id: str) -> None:
    row = _require_run(run_id)
    if row.status in {"succeeded", "failed", "cancelled", "paused"}:
        return
    control = _runtime(run_id)
    if control:
        control.cancel_event.set()
    status = "cancelled" if row.status == "queued" else "paused"
    _update_run(run_id, status=status)
    log_bus.publish(run_id, "warning", f"run marked {status}")


def resume(run_id: str) -> str:
    source = _require_run(run_id)
    if source.kind != "generate":
        raise ValueError("resume currently supports generate runs only")
    params = _params_from_run(source)
    exp_config = _build_exp_config(params)
    row = _build_run_row(kind=source.kind, params=params, exp_config=exp_config, image_model=source.image_model, parent_run_id=source.id)
    row = RunRow(**(asdict(row) | {"planner_prompt": source.planner_prompt, "visualizer_prompt": source.visualizer_prompt, "last_stage": source.last_stage}))
    new_run_id = _create_and_launch(row, _RunControl(kind="generate", params=params, cancel_event=threading.Event()), start_now=False)
    _copy_completed_stages(source, new_run_id)
    _write_run_snapshot(new_run_id)
    _launch(new_run_id)
    return new_run_id


async def _run_pipeline(run_id: str) -> None:
    row = _require_run(run_id)
    control = _runtime(run_id)
    try:
        if row.kind == "battle":
            await _run_battle(run_id, row, control)
        elif row.kind == "refine":
            await _run_refine(run_id, row, control)
        else:
            await _run_generate(run_id, row, control)
    except Exception as exc:  # noqa: BLE001
        _update_run(run_id, status="failed", error=str(exc), completed_at=_now())
        log_bus.publish(run_id, "error", str(exc))
        raise
    finally:
        with _LOCK:
            _RUNTIME.pop(run_id, None)


def _snapshot_stage(run_id: str, stage: str, data: dict) -> None:
    payload, refs = _extract_refs(run_id=run_id, stage=stage, data=data)
    payload_path = _run_dir(run_id) / "stages" / f"{stage}.json"
    payload_path.parent.mkdir(parents=True, exist_ok=True)
    payload_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    stage_row = _find_stage(run_id, stage)
    if stage_row is None or stage_row.id is None:
        raise ValueError(f"missing stage row for snapshot: {run_id}/{stage}")
    runs_repo.update_stage(stage_row.id, payload_path=f"stages/{stage}.json", image_paths=json.dumps(refs), finished_at=_now(), status="succeeded")


def _create_and_launch(row: RunRow, control: _RunControl, *, start_now: bool = True) -> str:
    run_id = runs_repo.create_run(row)
    _run_dir(run_id).mkdir(parents=True, exist_ok=True)
    with _LOCK:
        _RUNTIME[run_id] = control
    _write_run_snapshot(run_id)
    if start_now:
        _launch(run_id)
    return run_id


def _launch(run_id: str) -> None:
    thread = threading.Thread(target=lambda: asyncio.run(_run_pipeline(run_id)), daemon=True)
    thread.start()


async def _run_generate(run_id: str, row: RunRow, control: _RunControl | None) -> None:
    params = _params_from_run(row)
    processor = _build_processor(_build_exp_config(params, image_model=row.image_model))
    data = _load_resume_data(run_id, row, params)
    await _run_stage_sequence(run_id, row, control, processor, data, stage_plan(row.exp_mode, row.max_critic_rounds or 0))


async def _run_battle(run_id: str, row: RunRow, control: _RunControl | None) -> None:
    params = _params_from_run(row)
    shared = _build_processor(_build_exp_config(params, image_model=row.image_model))
    data = _initial_data(params)
    shared_plan = battle_shared_plan(row.exp_mode, row.max_critic_rounds or 0)
    data = await _run_stage_sequence(
        run_id,
        row,
        control,
        shared,
        data,
        shared_plan,
        finalize=False,
    )
    if _require_run(run_id).status != "running":
        return
    for model_id in tuple(control.image_models if control else (row.image_model,)):
        if _cancelled(control):
            _pause_or_cancel(run_id, _require_run(run_id).last_stage)
            return
        child_id = battle_repo.create_battle(BattleRunRow(parent_run_id=run_id, image_model=model_id, status="running"))
        child_processor = _build_processor(_build_exp_config(params, image_model=model_id))
        child_data = await child_processor.visualizer_agent.process(dict(data))
        final_path = _write_battle_final(run_id, child_id, row.exp_mode, child_data, row.max_critic_rounds or 0)
        battle_repo.update_battle(child_id, status="succeeded", final_image_path=final_path)
    _update_run(run_id, status="succeeded", completed_at=_now())


async def _run_refine(run_id: str, row: RunRow, control: _RunControl | None) -> None:
    params = control.params if control else None
    if not isinstance(params, RefineParams):
        raise ValueError("missing refine params")
    _update_run(run_id, status="running")
    stage_id = runs_repo.upsert_stage(run_id, StageRow(stage_name="refine", status="running", started_at=_now()))
    del stage_id
    result_b64 = await _call_refine(params, row.image_model)
    data = {"edit_prompt": params.edit_prompt, "refined_diagram_base64_jpg": result_b64}
    _snapshot_stage(run_id, "refine", data)
    final_path = _write_final_image(run_id, "dev_polish", data, 0, image_key="refined_diagram_base64_jpg")
    _update_run(run_id, status="succeeded", last_stage="refine", final_image_path=final_path, completed_at=_now(), caption=params.edit_prompt)


async def _run_stage_sequence(
    run_id: str,
    row: RunRow,
    control: _RunControl | None,
    processor: Any,
    data: dict[str, Any],
    plan: tuple[StageSpec, ...],
    finalize: bool = True,
) -> dict[str, Any]:
    _update_run(run_id, status="running")
    for spec in _remaining(plan, row.last_stage):
        if _cancelled(control):
            _pause_or_cancel(run_id, row.last_stage)
            return data
        runs_repo.upsert_stage(run_id, StageRow(stage_name=spec.name, status="running", started_at=_now()))
        log_bus.publish(run_id, "info", f"stage started: {spec.name}", stage=spec.name)
        data = await _execute_stage(processor, data, spec, row.retrieval_setting)
        _snapshot_stage(run_id, spec.name, data)
        row = _require_run(run_id)
        row = _update_progress(run_id, row, spec.name, data)
        log_bus.publish(run_id, "info", f"stage completed: {spec.name}", stage=spec.name)
    if _cancelled(control):
        _pause_or_cancel(run_id, row.last_stage)
        return data
    if finalize:
        final_path = _write_final_image(run_id, row.exp_mode, data, row.max_critic_rounds or 0)
        _update_run(run_id, status="succeeded", completed_at=_now(), final_image_path=final_path)
    return data


async def _execute_stage(processor: Any, data: dict[str, Any], spec: StageSpec, retrieval_setting: str) -> dict[str, Any]:
    if spec.op == "retriever":
        return await processor.retriever_agent.process(data, retrieval_setting=retrieval_setting)
    if spec.op == "planner":
        return await processor.planner_agent.process(data)
    if spec.op == "stylist":
        return await processor.stylist_agent.process(data)
    if spec.op == "visualizer":
        return await processor.visualizer_agent.process(data)
    if spec.op == "vanilla":
        return await processor.vanilla_agent.process(data)
    if spec.op == "polish":
        return await processor.polish_agent.process(data)
    data["current_critic_round"] = spec.round_idx
    data = await processor.critic_agent.process(data, source=spec.source or "stylist")
    if data.get(f"target_diagram_critic_suggestions{spec.round_idx}", "").strip() == "No changes needed.":
        return data
    return await processor.visualizer_agent.process(data)


def _update_progress(run_id: str, row: RunRow, stage: str, data: dict[str, Any]) -> RunRow:
    fields = _prompt_fields(data)
    _update_run(run_id, last_stage=stage, **fields)
    return _require_run(run_id)


def _extract_refs(run_id: str, stage: str, data: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    refs: list[str] = []
    counter = {"value": 0}
    stage_dir = _run_dir(run_id) / "stages" / stage

    def walk(value: Any, key: str = "") -> Any:
        if isinstance(value, dict):
            return {item_key: walk(item_value, item_key) for item_key, item_value in value.items()}
        if isinstance(value, list):
            return [walk(item, key) for item in value]
        if isinstance(value, str) and key.endswith("_base64_jpg") and value:
            index = counter["value"]
            counter["value"] += 1
            rel_path = Path("stages") / stage / f"candidate_{index}.png"
            _write_png(_run_dir(run_id) / rel_path, value)
            refs.append(rel_path.as_posix())
            return {"$ref": rel_path.as_posix()}
        return value

    return walk(dict(data)), refs


def _load_resume_data(run_id: str, row: RunRow, params: GenerateParams) -> dict[str, Any]:
    data = _initial_data(params)
    for name in stage_names_until(row.exp_mode, row.max_critic_rounds or 0, row.last_stage):
        data.update(_hydrate_refs(run_id, runs_repo.load_stage_payload(run_id, name)))
    return data


def _hydrate_refs(run_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    def walk(value: Any, key: str = "") -> Any:
        if isinstance(value, dict) and set(value) == {"$ref"}:
            return _png_to_base64(_run_dir(run_id) / value["$ref"]) if key.endswith("_base64_jpg") else value
        if isinstance(value, dict):
            return {item_key: walk(item_value, item_key) for item_key, item_value in value.items()}
        if isinstance(value, list):
            return [walk(item, key) for item in value]
        return value

    return walk(payload)


def _copy_completed_stages(source: RunRow, target_run_id: str) -> None:
    for stage in runs_repo.list_stages(source.id):
        if stage.status != "succeeded":
            continue
        stage_root = _run_dir(source.id) / "stages"
        source_json = stage_root / f"{stage.stage_name}.json"
        if source_json.exists():
            target_json = _run_dir(target_run_id) / "stages" / source_json.name
            target_json.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_json, target_json)
        source_dir = stage_root / stage.stage_name
        if source_dir.is_dir():
            shutil.copytree(source_dir, _run_dir(target_run_id) / "stages" / stage.stage_name, dirs_exist_ok=True)
        runs_repo.upsert_stage(target_run_id, StageRow(stage_name=stage.stage_name, status=stage.status, started_at=stage.started_at, finished_at=stage.finished_at, payload_path=stage.payload_path, image_paths=stage.image_paths, error=stage.error))


def _build_exp_config(params: GenerateParams, image_model: str | None = None) -> ExpConfig:
    config_service.reload()
    return ExpConfig(dataset_name="PaperBananaBench", split_name="run", exp_mode=params.exp_mode, retrieval_setting=params.retrieval_setting, max_critic_rounds=params.max_critic_rounds, main_model_name=params.main_model, image_gen_model_name=image_model or params.image_model, work_dir=_repo_root())


def _build_refine_config(params: RefineParams) -> ExpConfig:
    config_service.reload()
    return ExpConfig(dataset_name="PaperBananaBench", split_name="run", exp_mode="dev_polish", retrieval_setting="none", main_model_name="", image_gen_model_name=params.image_model, work_dir=_repo_root())


def _build_processor(exp_config: ExpConfig) -> Any:
    from agents.critic_agent import CriticAgent
    from agents.planner_agent import PlannerAgent
    from agents.polish_agent import PolishAgent
    from agents.retriever_agent import RetrieverAgent
    from agents.stylist_agent import StylistAgent
    from agents.vanilla_agent import VanillaAgent
    from agents.visualizer_agent import VisualizerAgent
    from utils.paperviz_processor import PaperVizProcessor

    return PaperVizProcessor(exp_config=exp_config, vanilla_agent=VanillaAgent(exp_config=exp_config), planner_agent=PlannerAgent(exp_config=exp_config), visualizer_agent=VisualizerAgent(exp_config=exp_config), stylist_agent=StylistAgent(exp_config=exp_config), critic_agent=CriticAgent(exp_config=exp_config), retriever_agent=RetrieverAgent(exp_config=exp_config), polish_agent=PolishAgent(exp_config=exp_config))


async def _call_refine(params: RefineParams, model_id: str) -> str:
    from utils import generation_utils, image_utils

    contents = [{"type": "text", "text": params.edit_prompt}, {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(params.image_bytes).decode("utf-8")}}]
    result = await generation_utils.call_image_gen_with_retry_async(model_name=model_id, contents=contents, prompt=params.edit_prompt, config={"aspect_ratio": params.aspect_ratio, "image_size": params.image_size, "size": "1536x1024", "quality": "high", "background": "opaque", "output_format": "png", "max_output_tokens": MAX_OUTPUT_TOKENS}, max_attempts=3, retry_delay=10, error_context="refine")
    if not result or not result[0]:
        raise ValueError("refine produced no image")
    converted = image_utils.convert_png_b64_to_jpg_b64(result[0])
    if not converted:
        raise ValueError("refine image conversion failed")
    return converted


def _build_run_row(kind: str, params: GenerateParams, exp_config: ExpConfig, image_model: str, parent_run_id: str | None = None) -> RunRow:
    now = _now()
    return RunRow(kind=kind, status="queued", exp_mode=params.exp_mode, retrieval_setting=params.retrieval_setting, num_candidates=params.num_candidates, aspect_ratio=params.aspect_ratio, figure_size=params.figure_size, figure_language=params.figure_language, max_critic_rounds=params.max_critic_rounds, main_model=exp_config.main_model_name, image_model=image_model, method_content=params.method_content, caption=params.caption, created_at=now, updated_at=now, parent_run_id=parent_run_id)


def _build_refine_row(params: RefineParams, exp_config: ExpConfig) -> RunRow:
    now = _now()
    return RunRow(kind="refine", status="queued", exp_mode="dev_polish", retrieval_setting="none", num_candidates=1, main_model=exp_config.main_model_name, image_model=exp_config.image_gen_model_name, method_content="", caption=params.edit_prompt, created_at=now, updated_at=now)


def _initial_data(params: GenerateParams) -> dict[str, Any]:
    return {"filename": "run_input", "candidate_id": 0, "caption": params.caption, "content": params.method_content, "visual_intent": params.caption, "additional_info": {"rounded_ratio": params.aspect_ratio, "figure_language": params.figure_language or ""}, "max_critic_rounds": params.max_critic_rounds}


def _write_final_image(run_id: str, exp_mode: str, data: dict[str, Any], max_rounds: int, image_key: str | None = None) -> str:
    key = image_key or _final_key(exp_mode, data, max_rounds)
    if not key or key not in data:
        raise ValueError("final image missing")
    path = _run_dir(run_id) / "final" / "candidate_0.png"
    _write_png(path, data[key])
    return path.relative_to(_results_dir()).as_posix()


def _write_battle_final(parent_run_id: str, battle_id: str, exp_mode: str, data: dict[str, Any], max_rounds: int) -> str:
    path = _run_dir(parent_run_id) / "battles" / battle_id / "final" / "candidate_0.png"
    _write_png(path, data[_final_key(exp_mode, data, max_rounds)])
    return path.relative_to(_results_dir()).as_posix()


def _write_png(path: Path, encoded_jpg: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(io.BytesIO(base64.b64decode(encoded_jpg)))
    image.save(path, format="PNG")


def _png_to_base64(path: Path) -> str:
    image = Image.open(path).convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _final_key(exp_mode: str, data: dict[str, Any], max_rounds: int) -> str:
    for index in range(max_rounds - 1, -1, -1):
        key = f"target_diagram_critic_desc{index}_base64_jpg"
        if data.get(key):
            return key
    if exp_mode in {"dev_full", "demo_full"} and data.get("target_diagram_stylist_desc0_base64_jpg"):
        return "target_diagram_stylist_desc0_base64_jpg"
    return {"vanilla": "vanilla_diagram_base64_jpg", "dev_polish": "polished_diagram_base64_jpg"}.get(exp_mode, "target_diagram_desc0_base64_jpg")


def _prompt_fields(data: dict[str, Any]) -> dict[str, Any]:
    return {"planner_prompt": data.get("target_diagram_desc0"), "visualizer_prompt": data.get("target_diagram_stylist_desc0") or data.get("target_diagram_desc0"), "updated_at": _now()}


def _resolve_model(model_id: str) -> None:
    if model_id:
        config_service.provider_registry.get_registry().resolve(model_id)


def _runtime(run_id: str) -> _RunControl | None:
    with _LOCK:
        return _RUNTIME.get(run_id)


def _remaining(plan: tuple[StageSpec, ...], last_stage: str | None) -> tuple[StageSpec, ...]:
    if last_stage is None:
        return plan
    names = [stage.name for stage in plan]
    return plan[names.index(last_stage) + 1 :] if last_stage in names else plan


def _pause_or_cancel(run_id: str, last_stage: str | None) -> None:
    _update_run(run_id, status="paused" if last_stage else "cancelled", completed_at=_now())


def _cancelled(control: _RunControl | None) -> bool:
    return bool(control and control.cancel_event.is_set())


def _params_from_run(row: RunRow) -> GenerateParams:
    return GenerateParams(method_content=row.method_content, caption=row.caption, exp_mode=row.exp_mode, main_model=row.main_model, image_model=row.image_model, retrieval_setting=row.retrieval_setting, num_candidates=row.num_candidates, aspect_ratio=row.aspect_ratio or "16:9", figure_size=row.figure_size, figure_language=row.figure_language, max_critic_rounds=row.max_critic_rounds or 0)


def _find_stage(run_id: str, stage_name: str) -> StageRow | None:
    return next((stage for stage in runs_repo.list_stages(run_id) if stage.stage_name == stage_name), None)


def _update_run(run_id: str, **fields: Any) -> None:
    runs_repo.update_run(run_id, **fields)
    _write_run_snapshot(run_id)
    # Wake SSE subscribers on terminal transitions so the frontend sees a
    # fresh `run` event, refetches detail, and renders the final gallery.
    status = fields.get("status")
    if status in {"succeeded", "failed", "cancelled", "paused"}:
        log_bus.publish(run_id, "info", f"run {status}")


def _write_run_snapshot(run_id: str) -> None:
    row = runs_repo.get_run(run_id)
    if row is None:
        return
    (_run_dir(run_id) / "run.json").write_text(json.dumps(asdict(row), ensure_ascii=False, indent=2), encoding="utf-8")


def _require_run(run_id: str) -> RunRow:
    row = runs_repo.get_run(run_id)
    if row is None:
        raise ValueError(f"unknown run id: {run_id}")
    return row


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _results_dir() -> Path:
    return _runs_dir().parent


def _runs_dir() -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured)


def _run_dir(run_id: str) -> Path:
    return _runs_dir() / run_id


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
