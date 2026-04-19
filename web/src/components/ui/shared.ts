import clsx, { type ClassValue } from 'clsx';
import type { CSSProperties } from 'react';

export type Tone = 'ok' | 'warn' | 'err' | 'neutral';
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'paused' | 'cancelled';
export type StageStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'paused';

export type Option = {
  disabled?: boolean;
  hint?: string;
  label: string;
  value: string;
};

export const panelClass = 'rounded-lg border border-border bg-surface shadow-card';
export const controlClass =
  'w-full rounded-md border border-border bg-surface px-4 py-3 text-sm text-primary shadow-card transition placeholder:text-muted focus:border-border-strong focus:outline-none';

const toneMap: Record<Tone, CSSProperties> = {
  ok: {
    backgroundColor: 'color-mix(in srgb, var(--accent-1) 12%, var(--bg-surface))',
    borderColor: 'color-mix(in srgb, var(--accent-1) 32%, var(--border))',
    color: 'var(--accent-1)',
  },
  warn: {
    backgroundColor: 'color-mix(in srgb, var(--warn) 12%, var(--bg-surface))',
    borderColor: 'color-mix(in srgb, var(--warn) 32%, var(--border))',
    color: 'var(--warn)',
  },
  err: {
    backgroundColor: 'color-mix(in srgb, var(--danger) 12%, var(--bg-surface))',
    borderColor: 'color-mix(in srgb, var(--danger) 32%, var(--border))',
    color: 'var(--danger)',
  },
  neutral: {
    backgroundColor: 'var(--bg-subtle)',
    borderColor: 'var(--border)',
    color: 'var(--text-secondary)',
  },
};

export const runStatusMeta: Record<RunStatus, { label: string; tone: Tone }> = {
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'err' },
  paused: { label: 'Paused', tone: 'warn' },
  queued: { label: 'Queued', tone: 'neutral' },
  running: { label: 'Running', tone: 'ok' },
  succeeded: { label: 'Succeeded', tone: 'ok' },
};

export function cn(...values: ClassValue[]) {
  return clsx(values);
}

export function getStageTone(status: StageStatus): Tone {
  if (status === 'failed') return 'err';
  if (status === 'paused') return 'warn';
  if (status === 'running' || status === 'succeeded') return 'ok';
  return 'neutral';
}

export function getToneStyle(tone: Tone): CSSProperties {
  return toneMap[tone];
}
