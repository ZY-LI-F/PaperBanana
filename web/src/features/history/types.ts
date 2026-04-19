import type { RunKind, RunStatus } from '../../lib/api';
import type { StageStatus } from '../../components/ui/shared';

export type HistoryRunSummary = {
  aspectRatio: string;
  caption: string;
  createdAt: string;
  error: string | null;
  expMode: string;
  figureLanguage: string | null;
  figureSize: string | null;
  finalImageUrl: string | null;
  id: string;
  imageModel: string;
  kind: RunKind;
  lastStage: string | null;
  mainModel: string;
  maxCriticRounds: number;
  methodContent: string;
  numCandidates: number;
  parentRunId: string | null;
  retrievalSetting: string;
  status: RunStatus;
  updatedAt: string;
};

export type HistoryStage = {
  error: string | null;
  finishedAt: string | null;
  imageUrls: string[];
  name: string;
  payload: Record<string, unknown> | null;
  startedAt: string | null;
  status: StageStatus;
};

export type HistoryRunDetail = HistoryRunSummary & {
  plannerPrompt: string | null;
  reuse: Record<string, unknown> | null;
  stages: HistoryStage[];
  visualizerPrompt: string | null;
};

export type HistoryListResponse = {
  items: HistoryRunSummary[];
  limit: number;
  offset: number;
  total: number;
};

export type PromptEntry = {
  label: string;
  value: string;
};

export type StagePromptGroups = {
  input: PromptEntry[];
  output: PromptEntry[];
};
