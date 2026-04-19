import { startTransition, useEffect, useState } from 'react';
import { connectEventStream } from '../../lib/api';
import type { LogStreamEntry } from './types';

type LogPayload = {
  level?: unknown;
  msg?: unknown;
  run_id?: unknown;
  seq?: unknown;
  stage?: unknown;
  ts?: unknown;
};

type UseLogStreamOptions = {
  runId: string;
};

type StreamStatus = 'connecting' | 'error' | 'live';

type UseLogStreamResult = {
  entries: LogStreamEntry[];
  error: string | null;
  status: StreamStatus;
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function normalizeLevel(value: unknown): LogStreamEntry['level'] | null {
  if (value === 'warning') return 'warn';
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : null;
}

function normalizeEntry(payload: LogPayload): LogStreamEntry | null {
  const runId = typeof payload.run_id === 'string' ? payload.run_id.trim() : '';
  const level = normalizeLevel(payload.level);
  const message = typeof payload.msg === 'string' ? payload.msg : '';
  const rawTimestamp = typeof payload.ts === 'string' ? payload.ts : '';
  if (!runId || !message || !rawTimestamp) return null;
  if (!level) return null;
  const seq = typeof payload.seq === 'number' ? payload.seq : Date.now();
  const stage = typeof payload.stage === 'string' && payload.stage ? payload.stage : 'system';

  return {
    id: `${runId}:${seq}`,
    level,
    message,
    rawTimestamp,
    runId,
    stage,
    timestamp: formatTimestamp(rawTimestamp),
  };
}

export function useLogStream({ runId }: UseLogStreamOptions): UseLogStreamResult {
  const [entries, setEntries] = useState<LogStreamEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');

  useEffect(() => {
    setEntries([]);
    setError(null);
    setStatus('connecting');

    const stream = connectEventStream<LogPayload>(
      '/api/logs/events',
      {
        event: 'log',
        onError: () => {
          setStatus('error');
          setError('日志连接中断，浏览器会自动尝试重连。');
        },
        onMessage: (payload) => {
          const nextEntry = normalizeEntry(payload);
          if (!nextEntry) return;
          setStatus('live');
          setError(null);
          startTransition(() => {
            setEntries((current) => [...current, nextEntry]);
          });
        },
      },
      { run_id: runId || undefined },
    );

    return () => stream.close();
  }, [runId]);

  return { entries, error, status };
}
