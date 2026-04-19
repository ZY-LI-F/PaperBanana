import type { RunStatus } from '../../lib/api';
import type {
  HistoryListResponse,
  HistoryRunDetail,
  HistoryRunSummary,
  HistoryStage,
  PromptEntry,
  StagePromptGroups,
} from './types';

const RUN_STATUSES: RunStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'paused',
  'cancelled',
];
const STAGE_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'paused'] as const;
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const RUN_KIND_VALUES = ['battle', 'generate', 'refine'] as const;

export function parseHistoryList(payload: unknown): HistoryListResponse {
  const root = toRecord(payload);
  return {
    items: readArray(root.items).map(parseHistoryRunSummary),
    limit: readNumber(root.limit),
    offset: readNumber(root.offset),
    total: readNumber(root.total),
  };
}

export function parseHistoryRunDetail(payload: unknown): HistoryRunDetail {
  const root = toRecord(payload);
  return {
    ...parseHistoryRunSummary(root),
    plannerPrompt: readOptionalString(root.planner_prompt),
    reuse: toNullableRecord(root.reuse),
    stages: readArray(root.stages).map(parseHistoryStage),
    visualizerPrompt: readOptionalString(root.visualizer_prompt),
  };
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

export function buildReuseState(detail: HistoryRunDetail): Record<string, unknown> {
  if (detail.reuse) return detail.reuse;
  return {
    aspect_ratio: detail.aspectRatio,
    caption: detail.caption,
    exp_mode: detail.expMode,
    figure_language: detail.figureLanguage,
    figure_size: detail.figureSize,
    image_model: detail.imageModel,
    main_model: detail.mainModel,
    max_critic_rounds: detail.maxCriticRounds,
    method_content: detail.methodContent,
    num_candidates: detail.numCandidates,
    parent_run_id: detail.id,
    retrieval_setting: detail.retrievalSetting,
  };
}

export function buildStagePromptGroups(stage: HistoryStage): StagePromptGroups {
  const payload = stage.payload;
  if (!payload) return { input: [], output: [] };
  if (stage.name === 'retriever') {
    return {
      input: createEntries(payload, [
        ['Method Content', 'content'],
        ['Caption', 'caption'],
        ['Visual Intent', 'visual_intent'],
      ]),
      output: createEntries(payload, [['Retrieved References', 'top10_references']]),
    };
  }
  if (stage.name === 'planner') {
    return {
      input: createEntries(payload, [
        ['Method Content', 'content'],
        ['Caption', 'caption'],
        ['Retrieved References', 'top10_references'],
      ]),
      output: createEntries(payload, [['Planner Prompt', 'target_diagram_desc0']]),
    };
  }
  if (stage.name === 'stylist') {
    return {
      input: createEntries(payload, [['Planner Prompt', 'target_diagram_desc0']]),
      output: createEntries(payload, [['Stylist Prompt', 'target_diagram_stylist_desc0']]),
    };
  }
  if (stage.name === 'visualizer') {
    return {
      input: resolveVisualizerInput(payload),
      output: [],
    };
  }
  if (stage.name.startsWith('critic_')) {
    return buildCriticPromptGroups(stage.name, payload);
  }
  return {
    input: createEntries(payload, [['Prompt In', 'content']]),
    output: [],
  };
}

export function formatStageLabel(stageName: string): string {
  if (stageName.startsWith('critic_')) {
    const round = Number(stageName.replace('critic_', '')) + 1;
    return `Critic Round ${round}`;
  }
  return stageName
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function parseHistoryRunSummary(payload: unknown): HistoryRunSummary {
  const root = toRecord(payload);
  return {
    aspectRatio: readString(root.aspect_ratio),
    caption: readString(root.caption),
    createdAt: readString(root.created_at),
    error: readOptionalString(root.error),
    expMode: readString(root.exp_mode),
    figureLanguage: readOptionalString(root.figure_language),
    figureSize: readOptionalString(root.figure_size),
    finalImageUrl: readOptionalString(root.final_image_url),
    id: readString(root.id),
    imageModel: readString(root.image_model),
    kind: normalizeRunKind(readString(root.kind)),
    lastStage: readOptionalString(root.last_stage),
    mainModel: readString(root.main_model),
    maxCriticRounds: readNumber(root.max_critic_rounds),
    methodContent: readString(root.method_content),
    numCandidates: readNumber(root.num_candidates),
    parentRunId: readOptionalString(root.parent_run_id),
    retrievalSetting: readString(root.retrieval_setting),
    status: normalizeRunStatus(readString(root.status)),
    updatedAt: readString(root.updated_at),
  };
}

function parseHistoryStage(payload: unknown): HistoryStage {
  const root = toRecord(payload);
  return {
    error: readOptionalString(root.error),
    finishedAt: readOptionalString(root.finished_at),
    imageUrls: readStringArray(root.image_urls),
    name: readString(root.stage_name),
    payload: toNullableRecord(root.payload),
    startedAt: readOptionalString(root.started_at),
    status: normalizeStageStatus(readString(root.status)),
  };
}

function buildCriticPromptGroups(
  stageName: string,
  payload: Record<string, unknown>,
): StagePromptGroups {
  const round = Number(stageName.replace('critic_', ''));
  const previousRound = round - 1;
  const inputKey = previousRound >= 0
    ? `target_diagram_critic_desc${previousRound}`
    : payload.target_diagram_stylist_desc0
      ? 'target_diagram_stylist_desc0'
      : 'target_diagram_desc0';
  return {
    input: createEntries(payload, [['Critic Input Prompt', inputKey]]),
    output: createEntries(payload, [
      ['Critic Suggestions', `target_diagram_critic_suggestions${round}`],
      ['Critic Prompt', `target_diagram_critic_desc${round}`],
    ]),
  };
}

function resolveVisualizerInput(payload: Record<string, unknown>): PromptEntry[] {
  const criticKeys = Object.keys(payload)
    .filter((key) => /^target_diagram_critic_desc\d+$/.test(key))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  const sourceKey = criticKeys[0]
    ?? (payload.target_diagram_stylist_desc0 ? 'target_diagram_stylist_desc0' : 'target_diagram_desc0');
  return createEntries(payload, [['Visualizer Prompt', sourceKey]]);
}

function createEntries(
  payload: Record<string, unknown>,
  entries: Array<[label: string, key: string]>,
): PromptEntry[] {
  return entries.flatMap(([label, key]) => {
    const value = normalizePromptValue(payload[key]);
    return value ? [{ label, value }] : [];
  });
}

function normalizePromptValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const lines = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    return lines.length ? lines.join('\n') : null;
  }
  return null;
}

function normalizeRunKind(value: string): HistoryRunSummary['kind'] {
  return RUN_KIND_VALUES.includes(value as HistoryRunSummary['kind'])
    ? (value as HistoryRunSummary['kind'])
    : 'generate';
}

function normalizeRunStatus(value: string): RunStatus {
  return RUN_STATUSES.includes(value as RunStatus)
    ? (value as RunStatus)
    : 'queued';
}

function normalizeStageStatus(value: string): HistoryStage['status'] {
  return STAGE_STATUSES.includes(value as HistoryStage['status'])
    ? (value as HistoryStage['status'])
    : 'pending';
}

function toRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function toNullableRecord(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function readArray(payload: unknown): unknown[] {
  return Array.isArray(payload) ? payload : [];
}

function readNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
