from __future__ import annotations

import asyncio
import json
import logging
import threading
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator

import server.settings as settings


class LogBus:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._seq = 0
        self._subs: dict[str | None, list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = defaultdict(list)

    async def subscribe(self, run_id: str | None) -> AsyncIterator[dict]:
        queue: asyncio.Queue[dict] = asyncio.Queue()
        subscriber = (asyncio.get_running_loop(), queue)
        with self._lock:
            self._subs[run_id].append(subscriber)
        try:
            while True:
                yield await queue.get()
        finally:
            with self._lock:
                self._subs[run_id] = [item for item in self._subs[run_id] if item != subscriber]

    def publish(self, run_id: str, level: str, msg: str, stage: str | None = None) -> None:
        event = self._event(run_id=run_id, level=level, msg=msg, stage=stage)
        self._append(event)
        for loop, queue in self._targets(run_id):
            loop.call_soon_threadsafe(queue.put_nowait, event)

    def _append(self, event: dict) -> None:
        path = _run_dir(event["run_id"]) / "logs.ndjson"
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    def _event(self, *, run_id: str, level: str, msg: str, stage: str | None) -> dict:
        with self._lock:
            self._seq += 1
            seq = self._seq
        return {
            "seq": seq,
            "ts": datetime.now(timezone.utc).isoformat(),
            "run_id": run_id,
            "level": level,
            "msg": msg,
            "stage": stage,
        }

    def _targets(
        self,
        run_id: str,
    ) -> list[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]:
        with self._lock:
            return [*self._subs.get(None, []), *self._subs.get(run_id, [])]


class RunLogHandler(logging.Handler):
    def __init__(self, bus: LogBus) -> None:
        super().__init__()
        self._bus = bus

    def emit(self, record: logging.LogRecord) -> None:
        run_id = getattr(record, "run_id", None)
        if not run_id:
            return
        self._bus.publish(
            run_id=run_id,
            level=record.levelname.lower(),
            msg=self.format(record),
            stage=getattr(record, "stage", None),
        )


def _run_dir(run_id: str) -> Path:
    configured = getattr(settings, "runs_dir", None)
    if callable(configured):
        configured = configured()
    if configured is None:
        configured = settings.RUNS_DIR
    return Path(configured) / run_id


log_bus = LogBus()
