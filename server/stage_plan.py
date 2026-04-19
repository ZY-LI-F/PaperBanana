from __future__ import annotations

from dataclasses import dataclass


CRITIC_MODES = frozenset({"dev_planner_critic", "demo_planner_critic"})
FULL_MODES = frozenset({"dev_full", "demo_full"})


@dataclass(frozen=True)
class StageSpec:
    name: str
    op: str
    round_idx: int | None = None
    source: str | None = None


def stage_plan(exp_mode: str, max_critic_rounds: int) -> tuple[StageSpec, ...]:
    if exp_mode == "vanilla":
        return (StageSpec(name="vanilla", op="vanilla"),)
    if exp_mode == "dev_planner":
        return _with_retriever(StageSpec(name="planner", op="planner"), StageSpec(name="visualizer", op="visualizer"))
    if exp_mode == "dev_planner_stylist":
        return _with_retriever(
            StageSpec(name="planner", op="planner"),
            StageSpec(name="stylist", op="stylist"),
            StageSpec(name="visualizer", op="visualizer"),
        )
    if exp_mode in CRITIC_MODES:
        return _with_retriever(
            StageSpec(name="planner", op="planner"),
            StageSpec(name="visualizer", op="visualizer"),
            *_critic_rounds(max_critic_rounds, source="planner"),
        )
    if exp_mode in FULL_MODES:
        return _with_retriever(
            StageSpec(name="planner", op="planner"),
            StageSpec(name="stylist", op="stylist"),
            StageSpec(name="visualizer", op="visualizer"),
            *_critic_rounds(max_critic_rounds, source="stylist"),
        )
    if exp_mode == "dev_polish":
        return (StageSpec(name="polish", op="polish"),)
    if exp_mode == "dev_retriever":
        return (StageSpec(name="retriever", op="retriever"),)
    raise ValueError(f"Unknown experiment name: {exp_mode}")


def battle_shared_plan(exp_mode: str, max_critic_rounds: int) -> tuple[StageSpec, ...]:
    plan = stage_plan(exp_mode, max_critic_rounds)
    shared = tuple(stage for stage in plan if stage.op in {"retriever", "planner", "stylist"})
    if not any(stage.op == "planner" for stage in shared):
        raise ValueError(f"Battle mode requires planner-backed exp_mode, got: {exp_mode}")
    return shared


def stage_names_until(exp_mode: str, max_critic_rounds: int, last_stage: str | None) -> tuple[str, ...]:
    names = tuple(stage.name for stage in stage_plan(exp_mode, max_critic_rounds))
    if last_stage is None:
        return ()
    if last_stage not in names:
        raise ValueError(f"Unknown last_stage for exp_mode {exp_mode}: {last_stage}")
    return names[: names.index(last_stage) + 1]


def _with_retriever(*stages: StageSpec) -> tuple[StageSpec, ...]:
    return (StageSpec(name="retriever", op="retriever"), *stages)


def _critic_rounds(max_critic_rounds: int, source: str) -> tuple[StageSpec, ...]:
    rounds = max(max_critic_rounds, 0)
    return tuple(
        StageSpec(name=f"critic_{index}", op="critic", round_idx=index, source=source)
        for index in range(rounds)
    )
