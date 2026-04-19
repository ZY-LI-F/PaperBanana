import type { GalleryImage } from '../../components/ui';
import type { RunStatus, StageStatus } from '../../components/ui/shared';

export type GenerateFormState = {
  aspectRatio: string;
  caption: string;
  expMode: string;
  figureLanguage: string;
  figureSize: string;
  imageModel: string;
  mainModel: string;
  maxCriticRounds: number;
  methodContent: string;
  numCandidates: number;
  parentRunId: string;
  retrievalSetting: string;
};

export type GenerateFormErrors = Partial<Record<keyof GenerateFormState, string>>;
export type GeneratePrefill = Partial<GenerateFormState>;

export type ProviderModel = {
  capabilities: string[];
  capability: string;
  id: string;
  kind: string;
  name: string;
};

export type ProviderRecord = {
  id: string;
  models: ProviderModel[];
  name: string;
};

export type PromptBlock = {
  label: string;
  value: string;
};

export type RunStreamPayload = {
  error?: string | null;
  final_image_url?: string | null;
  id: string;
  status: RunStatus;
  updated_at?: string;
};

export type RunStagePayload = {
  error?: string | null;
  finished_at?: string | null;
  image_names: string[];
  image_urls: string[];
  payload?: Record<string, unknown> | null;
  stage_name: string;
  started_at?: string | null;
  status: string;
};

export type RunDetailPayload = RunStreamPayload & {
  battles: unknown[];
  caption?: string;
  final_image_name?: string | null;
  planner_prompt?: string | null;
  reuse?: Record<string, unknown>;
  stages: RunStagePayload[];
  visualizer_prompt?: string | null;
};

export type GenerateStageView = {
  error?: string | null;
  finishedAt?: string | null;
  imageUrls: string[];
  name: string;
  promptBlocks: PromptBlock[];
  rawPayload?: Record<string, unknown> | null;
  startedAt?: string | null;
  status: StageStatus;
};

export type GenerateGalleryImage = GalleryImage;

export type RunEventsState = {
  connectionState: 'closed' | 'connecting' | 'error' | 'open';
  lastEventAt: number | null;
};
