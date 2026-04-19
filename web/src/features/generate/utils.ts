import { ApiError } from '../../lib/api';
export { buildHeroVariants, downloadVariants } from './heroVariants';
import type { Option, RunStatus, StageStatus } from '../../components/ui/shared';
import type {
  GenerateFormErrors,
  GenerateFormState,
  GenerateGalleryImage,
  GeneratePrefill,
  GenerateStageView,
  PromptBlock,
  ProviderModel,
  ProviderRecord,
  RunDetailPayload,
  RunStagePayload,
  RunStreamPayload,
} from './types';

const CRITIC_MODE = 'demo_planner_critic';
const FULL_MODE = 'demo_full';
const PROMPT_FIELD_PATTERN = /prompt|desc|suggestion|caption|content|intent/i;
const TERMINAL_STATUSES: RunStatus[] = ['cancelled', 'failed', 'paused', 'succeeded'];

export function validateGenerateForm(form: GenerateFormState): GenerateFormErrors {
  const errors: GenerateFormErrors = {};
  if (!form.methodContent.trim()) errors.methodContent = 'Method content is required.';
  if (!form.caption.trim()) errors.caption = 'Figure caption is required.';
  if (!form.mainModel.trim()) errors.mainModel = 'Main model is required.';
  if (!form.imageModel.trim()) errors.imageModel = 'Image model is required.';
  if (form.numCandidates < 1 || form.numCandidates > 20) {
    errors.numCandidates = 'Number of candidates must be between 1 and 20.';
  }
  if (form.maxCriticRounds < 1 || form.maxCriticRounds > 5) {
    errors.maxCriticRounds = 'Max critic rounds must be between 1 and 5.';
  }
  return errors;
}

export function isTerminalRunStatus(status: string | null | undefined): status is RunStatus {
  return TERMINAL_STATUSES.includes(status as RunStatus);
}

export function createPlannedStages(expMode: string, maxCriticRounds: number): GenerateStageView[] {
  return stageNames(expMode, maxCriticRounds).map((name) => ({
    imageUrls: [],
    name,
    promptBlocks: [],
    status: 'pending',
  }));
}

export function mergeStageEvent(
  stages: GenerateStageView[],
  event: RunStagePayload
): GenerateStageView[] {
  const nextStage = toStageView(event);
  const index = stages.findIndex((stage) => stage.name === nextStage.name);
  if (index === -1) return [...stages, nextStage];

  const updated = [...stages];
  updated[index] = { ...updated[index], ...nextStage };
  return updated;
}

/**
 * @deprecated Prefer `buildHeroVariants`, which preserves stage-level artifacts
 * and final candidates for the Generate route hero gallery.
 */
export function buildGallery(detail: RunDetailPayload): GenerateGalleryImage[] {
  const latestStage = [...detail.stages].reverse().find((stage) => stage.image_urls.length > 0);
  const urls = dedupeUrls(detail.final_image_url, latestStage?.image_urls ?? []);

  return urls.map((src, index) => ({
    id: `${detail.id}-${index}`,
    src,
    subtitle: detail.caption || `Run ${detail.id}`,
    title: `Candidate ${index + 1}`,
  }));
}

export function parseProvidersResponse(payload: unknown): ProviderRecord[] {
  const root = toRecord(payload);
  const providers = Array.isArray(root.providers) ? root.providers : [];
  return providers.map(parseProvider).filter(Boolean) as ProviderRecord[];
}

export function parseDefaultsResponse(payload: unknown): {
  imageModel: string;
  mainModel: string;
} {
  const root = toRecord(payload);
  const defaults = toRecord(root.defaults);
  return {
    imageModel: pickString(defaults, 'image_gen_model', 'imageModel'),
    mainModel: pickString(defaults, 'main_model', 'mainModel'),
  };
}

export function buildModelOptions(providers: ProviderRecord[]): {
  image: Option[];
  main: Option[];
} {
  return {
    image: createOptions(providers, 'image'),
    main: createOptions(providers, 'text'),
  };
}

export function normalizePrefill(payload: unknown): GeneratePrefill | null {
  const source = findPrefillSource(payload);
  if (!source) return null;

  const prefill: GeneratePrefill = {
    aspectRatio: pickString(source, 'aspect_ratio', 'aspectRatio'),
    caption: pickString(source, 'caption'),
    expMode: pickString(source, 'exp_mode', 'expMode'),
    figureLanguage: pickString(source, 'figure_language', 'figureLanguage'),
    figureSize: pickString(source, 'figure_size', 'figureSize'),
    imageModel: pickString(source, 'image_model', 'imageModel', 'image_gen_model'),
    mainModel: pickString(source, 'main_model', 'mainModel'),
    methodContent: pickString(source, 'method_content', 'methodContent'),
    parentRunId: pickString(source, 'parent_run_id', 'parentRunId'),
    retrievalSetting: pickString(source, 'retrieval_setting', 'retrievalSetting'),
  };

  const numCandidates = pickNumber(source, 'num_candidates', 'numCandidates');
  const maxCriticRounds = pickNumber(source, 'max_critic_rounds', 'maxCriticRounds');

  if (numCandidates !== null) prefill.numCandidates = numCandidates;
  if (maxCriticRounds !== null) prefill.maxCriticRounds = maxCriticRounds;

  return Object.values(prefill).some((value) => value !== '') ? prefill : null;
}

export function parseRunCreateResponse(payload: unknown): { runId: string } {
  const root = toRecord(payload);
  const runId = pickString(root, 'run_id', 'runId');
  if (!runId) throw new Error('Run creation response is missing run_id.');
  return { runId };
}

export function parseRunDetail(payload: unknown): RunDetailPayload {
  const root = toRecord(payload);
  const id = pickString(root, 'id');
  if (!id) throw new Error('Run detail is missing id.');

  return {
    battles: Array.isArray(root.battles) ? root.battles : [],
    caption: pickOptionalString(root, 'caption'),
    error: pickOptionalString(root, 'error'),
    final_image_name: pickOptionalString(root, 'final_image_name'),
    final_image_url: pickOptionalString(root, 'final_image_url'),
    id,
    num_candidates: pickNumber(root, 'num_candidates'),
    planner_prompt: pickOptionalString(root, 'planner_prompt'),
    reuse: toNullableRecord(root.reuse),
    stages: parseStages(root.stages),
    status: normalizeRunStatus(pickString(root, 'status')),
    updated_at: pickOptionalString(root, 'updated_at') || undefined,
    visualizer_prompt: pickOptionalString(root, 'visualizer_prompt'),
  };
}

export function parseRunEvent(payload: unknown): RunStreamPayload {
  const root = toRecord(payload);
  const id = pickString(root, 'id');
  if (!id) throw new Error('Run event is missing id.');

  return {
    error: pickOptionalString(root, 'error'),
    final_image_url: pickOptionalString(root, 'final_image_url'),
    id,
    status: normalizeRunStatus(pickString(root, 'status')),
    updated_at: pickOptionalString(root, 'updated_at') || undefined,
  };
}

export function parseStageEvent(payload: unknown): RunStagePayload {
  const root = toRecord(payload);
  const stageName = pickString(root, 'stage_name');
  if (!stageName) throw new Error('Stage event is missing stage_name.');

  return {
    error: pickOptionalString(root, 'error'),
    finished_at: pickOptionalString(root, 'finished_at'),
    image_names: readStringList(root.image_names),
    image_urls: readStringList(root.image_urls),
    payload: toNullableRecord(root.payload),
    stage_name: stageName,
    started_at: pickOptionalString(root, 'started_at'),
    status: pickString(root, 'status') || 'pending',
  };
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = toRecord(error.details);
    return pickString(details, 'detail') || error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function stageNames(expMode: string, maxCriticRounds: number): string[] {
  const criticRounds = Array.from(
    { length: Math.max(maxCriticRounds, 0) },
    (_, index) => `critic_${index}`
  );
  if (expMode === CRITIC_MODE) {
    return ['retriever', 'planner', 'visualizer', ...criticRounds];
  }
  if (expMode === FULL_MODE) {
    return ['retriever', 'planner', 'stylist', 'visualizer', ...criticRounds];
  }
  return ['retriever', 'planner', 'visualizer'];
}

function toStageView(event: RunStagePayload): GenerateStageView {
  return {
    error: event.error,
    finishedAt: event.finished_at,
    imageUrls: event.image_urls,
    name: event.stage_name,
    promptBlocks: extractPromptBlocks(event.payload),
    rawPayload: event.payload,
    startedAt: event.started_at,
    status: normalizeStageStatus(event.status),
  };
}

function dedupeUrls(finalUrl: string | null | undefined, stageUrls: string[]): string[] {
  const seen = new Set<string>();
  return [finalUrl, ...stageUrls].flatMap((value) => {
    if (!value || seen.has(value)) return [];
    seen.add(value);
    return [value];
  });
}

function extractPromptBlocks(payload: Record<string, unknown> | null | undefined): PromptBlock[] {
  if (!payload) return [];
  return Object.entries(payload).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed || !PROMPT_FIELD_PATTERN.test(key)) return [];
    return [{ label: humanizeKey(key), value: trimmed }];
  });
}

function parseProvider(payload: unknown): ProviderRecord | null {
  const provider = toRecord(payload);
  const id = pickString(provider, 'id');
  if (!id) return null;

  return {
    id,
    models: parseModels(provider.models),
    name: pickString(provider, 'name') || id,
  };
}

function parseModels(payload: unknown): ProviderModel[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((model) => {
    const root = toRecord(model);
    return {
      capabilities: readStringList(root.capabilities),
      capability: pickString(root, 'capability') || 'chat',
      id: pickString(root, 'id'),
      kind: pickString(root, 'kind') || 'text',
      name: pickString(root, 'name'),
    };
  });
}

function createOptions(providers: ProviderRecord[], kind: 'image' | 'text'): Option[] {
  return providers.flatMap((provider) =>
    provider.models.flatMap((model) =>
      includeModel(model, kind)
        ? [
            {
              hint: `${provider.name} / ${model.name}`,
              label: `${provider.name} / ${model.name}`,
              value: model.id,
            },
          ]
        : []
    )
  );
}

function includeModel(model: ProviderModel, kind: 'image' | 'text'): boolean {
  const isImage =
    model.kind === 'image' || model.capability === 'image' || model.capabilities.includes('image');
  return kind === 'image' ? isImage : !isImage;
}

function findPrefillSource(payload: unknown): Record<string, unknown> | null {
  const root = toNullableRecord(payload);
  if (!root) return null;
  if (toNullableRecord(root.prefill)) return toNullableRecord(root.prefill);
  if (toNullableRecord(root.reuse)) return toNullableRecord(root.reuse);
  return root;
}

function parseStages(payload: unknown): RunStagePayload[] {
  if (!Array.isArray(payload)) return [];
  return payload.map(parseStageEvent);
}

function normalizeRunStatus(status: string): RunStatus {
  const candidates: RunStatus[] = [
    'cancelled',
    'failed',
    'paused',
    'queued',
    'running',
    'succeeded',
  ];
  return candidates.includes(status as RunStatus) ? (status as RunStatus) : 'queued';
}

function normalizeStageStatus(status: string): StageStatus {
  const candidates: StageStatus[] = ['failed', 'paused', 'pending', 'running', 'succeeded'];
  return candidates.includes(status as StageStatus) ? (status as StageStatus) : 'pending';
}

function humanizeKey(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (segment) => segment.toUpperCase());
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

function pickString(root: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (typeof root[key] === 'string') return String(root[key]);
  }
  return '';
}

function pickOptionalString(root: Record<string, unknown>, ...keys: string[]): string | null {
  const value = pickString(root, ...keys);
  return value || null;
}

function pickNumber(root: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (typeof root[key] === 'number') return root[key] as number;
  }
  return null;
}

function readStringList(payload: unknown): string[] {
  return Array.isArray(payload)
    ? payload.filter((value): value is string => typeof value === 'string')
    : [];
}
