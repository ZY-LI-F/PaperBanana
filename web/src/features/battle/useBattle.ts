import { startTransition, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { StageTimelineItem } from '../../components/ui';
import type { RunStatus } from '../../lib/api';
import type { BattleCell, BattleState, SubmitBattleInput } from './types';

type BattleCreateResponse = {
  parent_run_id?: string;
};

type BattleRowPayload = {
  error?: string | null;
  final_image_url?: string | null;
  id?: string;
  image_model?: string;
  status?: RunStatus;
};

type StagePayload = {
  error?: string | null;
  stage_name?: string;
  status?: StageTimelineItem['status'];
};

type RunDetailPayload = {
  battles?: BattleRowPayload[];
  error?: string | null;
  id?: string;
  stages?: StagePayload[];
  status?: RunStatus;
};

type BattleSession = {
  modelLabels: Record<string, string>;
  orderedModels: string[];
  parentRunId: string;
  startedAtMs: number;
};

const POLL_INTERVAL_MS = 500;
const TERMINAL_STATUSES: RunStatus[] = ['succeeded', 'failed', 'paused', 'cancelled'];

async function fetchJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = (await response.json()) as T;
  if (!response.ok) throw new Error(`Request failed for ${path}`);
  return payload;
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Battle request failed';
}

function isTerminal(status: RunStatus | undefined) {
  return Boolean(status && TERMINAL_STATUSES.includes(status));
}

function formatElapsed(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 100) / 10);
  return `${seconds.toFixed(1)}s`;
}

function toStageTimeline(stages: StagePayload[]) {
  return stages
    .filter((stage): stage is Required<Pick<StagePayload, 'stage_name' | 'status'>> & StagePayload => Boolean(stage.stage_name && stage.status))
    .map<StageTimelineItem>((stage) => ({
      detail: stage.error ?? `status: ${stage.status}`,
      name: stage.stage_name,
      status: stage.status,
    }));
}

function rememberFinishedBattles(rows: BattleRowPayload[], finishedAt: Record<string, number>) {
  const now = Date.now();
  for (const row of rows) {
    if (!row.id || !isTerminal(row.status) || finishedAt[row.id]) continue;
    finishedAt[row.id] = now;
  }
}

function openRunStream(runId: string, onEvent: () => void, onError: () => void) {
  const source = new EventSource(`/api/runs/${runId}/events`);
  const handler = () => onEvent();
  source.addEventListener('log', handler);
  source.addEventListener('run', handler);
  source.addEventListener('stage', handler);
  source.onerror = onError;
  return () => source.close();
}

function buildCells({
  finishedAt,
  now,
  session,
  snapshot,
}: {
  finishedAt: Record<string, number>;
  now: number;
  session: BattleSession | null;
  snapshot: RunDetailPayload | null;
}) {
  if (!session) return [];
  const rows = Array.isArray(snapshot?.battles) ? snapshot.battles : [];
  const rowsByModel = new Map(rows.filter((row): row is Required<Pick<BattleRowPayload, 'image_model'>> & BattleRowPayload => Boolean(row.image_model)).map((row) => [row.image_model, row]));
  return session.orderedModels.map<BattleCell>((modelId) => {
    const row = rowsByModel.get(modelId);
    const rowId = row?.id ?? modelId;
    const endedAt = row?.id ? finishedAt[row.id] : undefined;
    return {
      detailHref: row?.id ? `/history/${row.id}` : null,
      elapsedLabel: formatElapsed((endedAt ?? now) - session.startedAtMs),
      error: row?.error ?? null,
      id: rowId,
      imageSrc: row?.final_image_url ?? null,
      modelId,
      modelLabel: session.modelLabels[modelId] ?? modelId,
      status: row?.status ?? 'queued',
    };
  });
}

function isBattleComplete(snapshot: RunDetailPayload) {
  const rows = Array.isArray(snapshot.battles) ? snapshot.battles : [];
  return isTerminal(snapshot.status) && rows.every((row) => isTerminal(row.status));
}

async function refreshSessionSnapshot({
  finishedAt,
  session,
  setClock,
  setError,
  setSnapshot,
  stop,
}: {
  finishedAt: Record<string, number>;
  session: BattleSession;
  setClock: (value: number) => void;
  setError: (value: string | null) => void;
  setSnapshot: (value: RunDetailPayload) => void;
  stop: () => void;
}) {
  try {
    const next = await fetchJson<RunDetailPayload>(`/api/runs/${session.parentRunId}`);
    rememberFinishedBattles(Array.isArray(next.battles) ? next.battles : [], finishedAt);
    startTransition(() => setSnapshot(next));
    setClock(Date.now());
    setError(null);
    if (isBattleComplete(next)) stop();
    return next;
  } catch (nextError) {
    setError(toMessage(nextError));
    return null;
  }
}

function useBattleSessionStream({
  finishedAtRef,
  session,
  setClock,
  setError,
  setSnapshot,
}: {
  finishedAtRef: MutableRefObject<Record<string, number>>;
  session: BattleSession | null;
  setClock: (value: number) => void;
  setError: (value: string | null) => void;
  setSnapshot: (value: RunDetailPayload | null) => void;
}) {
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let intervalId = 0;
    let isRefreshing = false;
    const streams = new Map<string, () => void>();
    const stop = () => {
      window.clearInterval(intervalId);
      for (const close of streams.values()) close();
      streams.clear();
    };
    const handleStreamError = (message: string) => {
      if (!disposed) setError(message);
    };
    const syncStreams = (snapshot: RunDetailPayload | null) => {
      const battleRows = Array.isArray(snapshot?.battles) ? snapshot.battles : [];
      const runIds = [session.parentRunId, ...battleRows.map((row) => row.id).filter((id): id is string => Boolean(id))];
      for (const runId of new Set(runIds)) {
        if (streams.has(runId)) continue;
        const message = runId === session.parentRunId ? '共享进度流已断开，仍在轮询 battle 状态。' : '子 run 进度流已断开，仍在轮询 battle 状态。';
        streams.set(runId, openRunStream(runId, () => void refresh(), () => handleStreamError(message)));
      }
    };

    async function refresh() {
      if (disposed || isRefreshing) return;
      isRefreshing = true;
      try {
        const next = await refreshSessionSnapshot({
          finishedAt: finishedAtRef.current,
          session,
          setClock,
          setError,
          setSnapshot: (value) => setSnapshot(value),
          stop,
        });
        syncStreams(next);
      } finally {
        isRefreshing = false;
      }
    }

    syncStreams(null);
    intervalId = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    void refresh();

    return () => {
      disposed = true;
      stop();
    };
  }, [finishedAtRef, session, setClock, setError, setSnapshot]);
}

async function submitBattleRequest(input: SubmitBattleInput) {
  const response = await fetchJson<BattleCreateResponse>('/api/battle', {
    body: JSON.stringify({
      aspect_ratio: input.aspectRatio,
      caption: input.caption,
      exp_mode: input.expMode,
      image_models: input.imageModels,
      main_model: input.mainModel,
      max_critic_rounds: input.maxCriticRounds,
      method_content: input.methodContent,
      retrieval_setting: input.retrievalSetting,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const parentRunId = typeof response.parent_run_id === 'string' ? response.parent_run_id : '';
  if (!parentRunId) throw new Error('Battle response did not include parent_run_id');
  return parentRunId;
}

function createBattleSession(input: SubmitBattleInput, parentRunId: string): BattleSession {
  return {
    modelLabels: input.modelLabels,
    orderedModels: [...input.imageModels],
    parentRunId,
    startedAtMs: Date.now(),
  };
}

export function useBattle(): BattleState {
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState<BattleSession | null>(null);
  const [snapshot, setSnapshot] = useState<RunDetailPayload | null>(null);
  const finishedAtRef = useRef<Record<string, number>>({});

  useBattleSessionStream({ finishedAtRef, session, setClock, setError, setSnapshot });

  const cells = useMemo(
    () => buildCells({ finishedAt: finishedAtRef.current, now: clock, session, snapshot }),
    [clock, session, snapshot],
  );

  const submit = async (input: SubmitBattleInput) => {
    setIsSubmitting(true);
    setError(null);
    setSnapshot(null);
    finishedAtRef.current = {};
    try {
      const parentRunId = await submitBattleRequest(input);
      setSession(createBattleSession(input, parentRunId));
      setClock(Date.now());
    } catch (submitError) {
      setError(toMessage(submitError));
      setSession(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    cells,
    error,
    isSubmitting,
    parentRunId: session?.parentRunId ?? null,
    parentStatus: snapshot?.status ?? (session ? 'queued' : null),
    stages: toStageTimeline(Array.isArray(snapshot?.stages) ? snapshot.stages : []),
    submit,
  };
}
