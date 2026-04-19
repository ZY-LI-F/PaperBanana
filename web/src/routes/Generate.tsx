import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs, Tag } from '../components/ui';
import { api } from '../lib/api';
import { GenerateForm } from '../features/generate/GenerateForm';
import HeroGallery from '../features/generate/HeroGallery';
import { StageTimeline } from '../features/generate/StageTimeline';
import { createInitialFormState, formReducer } from '../features/generate/formReducer';
import { useRunEvents } from '../features/generate/hooks/useRunEvents';
import { useGeneratePrefillStore } from '../features/generate/store';
import type {
  GenerateFormErrors,
  GenerateFormState,
  GenerateStageView,
  HeroVariant,
  ProviderRecord,
  RunDetailPayload,
  RunStagePayload,
  RunStatus,
} from '../features/generate/types';
import {
  buildHeroVariants,
  buildModelOptions,
  createPlannedStages,
  describeError,
  isTerminalRunStatus,
  mergeStageEvent,
  normalizePrefill,
  parseDefaultsResponse,
  parseProvidersResponse,
  parseRunCreateResponse,
  parseRunDetail,
  parseRunEvent,
  parseStageEvent,
  validateGenerateForm,
} from '../features/generate/utils';

export default function GenerateRoute() {
  const location = useLocation();
  const { prefill, setPrefill } = useGeneratePrefillStore();
  const [form, dispatch] = useReducer(formReducer, undefined, createInitialFormState);
  const [errors, setErrors] = useState<GenerateFormErrors>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [stages, setStages] = useState<GenerateStageView[]>([]);
  const [variants, setVariants] = useState<HeroVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null);
  const [activeNumCandidates, setActiveNumCandidates] = useState(0);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fetchedDetailRef = useRef<string | null>(null);

  useEffect(() => {
    const nextPrefill = normalizePrefill(location.state);
    if (nextPrefill) setPrefill(nextPrefill);
  }, [location.state, setPrefill]);

  useEffect(() => {
    if (!prefill) return;
    dispatch({ prefill, type: 'applyPrefill' });
  }, [prefill]);

  useEffect(() => {
    void loadModelData(setProviders, setModelLoadError, (mainModel, imageModel) =>
      dispatch({ imageModel, mainModel, type: 'applyModelDefaults' })
    );
  }, []);

  const streamState = useRunEvents({
    enabled: Boolean(runId && !isTerminalRunStatus(runStatus)),
    onError: setStreamError,
    onRun: (payload) => {
      const event = parseRunEvent(payload);
      setFinalImageUrl(event.final_image_url ?? null);
      setRunStatus(event.status);
    },
    onStage: (payload) => {
      const event = parseStageEvent(payload);
      setStages((current) => mergeStageEvent(current, event));
    },
    runId,
  });

  useEffect(() => {
    if (!runId || !isTerminalRunStatus(runStatus)) return;
    const fetchKey = `${runId}:${runStatus}`;
    if (fetchedDetailRef.current === fetchKey) return;
    fetchedDetailRef.current = fetchKey;
    void loadRunDetail(
      runId,
      setActiveNumCandidates,
      setFinalImageUrl,
      setStages,
      setSubmitError,
      setVariants
    );
  }, [runId, runStatus]);

  useEffect(() => {
    if (!runId) {
      setVariants([]);
      return;
    }
    setVariants(
      buildHeroVariants(
        createRunDetailSnapshot(runId, runStatus, finalImageUrl, stages, activeNumCandidates)
      )
    );
  }, [activeNumCandidates, finalImageUrl, runId, runStatus, stages]);

  const modelOptions = buildModelOptions(providers);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface px-6 py-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Tag tone="ok">Generate</Tag>
            <div>
              <h1 className="m-0 text-2xl font-semibold text-primary">Clinical prompt intake</h1>
              <p className="m-0 text-sm text-secondary">
                Method text, caption, retrieval settings, model pickers, live stage telemetry, and
                final artifact gallery.
              </p>
            </div>
          </div>
          {runId ? (
            <div className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm text-secondary">
              <p className="m-0 font-medium text-primary">Active run</p>
              <p className="m-0">{runId}</p>
            </div>
          ) : null}
        </div>
      </section>

      <Tabs
        items={[
          {
            key: 'candidates',
            label: 'Generated candidates',
            meta: variants.length > 0 ? String(variants.length) : undefined,
            content: (
              <HeroGallery
                onSelect={setSelectedVariantId}
                runId={runId}
                runStatus={runStatus}
                selectedId={selectedVariantId}
                variants={variants}
              />
            ),
          },
          {
            key: 'stages',
            label: 'Stage timeline',
            meta: stages.length > 0 ? String(stages.length) : undefined,
            content: (
              <StageTimeline
                runStatus={runStatus}
                stages={stages}
                streamError={streamError}
                streamState={streamState}
              />
            ),
          },
        ]}
      />

      <GenerateForm
        errors={errors}
        form={form}
        imageModelOptions={modelOptions.image}
        isRunning={runStatus === 'running' || runStatus === 'queued'}
        isSubmitting={isSubmitting}
        mainModelOptions={modelOptions.main}
        modelLoadError={modelLoadError}
        submitError={submitError}
        onChange={(field, value) => {
          setErrors((current) => ({ ...current, [field]: undefined }));
          dispatch({ field, type: 'setField', value });
        }}
        onSubmit={(event) =>
          handleSubmit(event, {
            form,
            resetFetchedDetail: () => {
              fetchedDetailRef.current = null;
            },
            setActiveNumCandidates,
            setErrors,
            setFinalImageUrl,
            setIsSubmitting,
            setRunId,
            setRunStatus,
            setSelectedVariantId,
            setStages,
            setStreamError,
            setSubmitError,
            setVariants,
          })
        }
      />
    </div>
  );
}

async function loadModelData(
  setProviders: (providers: ProviderRecord[]) => void,
  setModelLoadError: (error: string | null) => void,
  applyDefaults: (mainModel: string, imageModel: string) => void
) {
  try {
    const [providersPayload, defaultsPayload] = await Promise.all([
      api.settings.providers(),
      api.settings.defaults(),
    ]);
    setProviders(parseProvidersResponse(providersPayload));
    const defaults = parseDefaultsResponse(defaultsPayload);
    applyDefaults(defaults.mainModel, defaults.imageModel);
    setModelLoadError(null);
  } catch (error) {
    setModelLoadError(describeError(error));
  }
}

async function loadRunDetail(
  runId: string,
  setActiveNumCandidates: (value: number) => void,
  setFinalImageUrl: (url: string | null) => void,
  setStages: Dispatch<SetStateAction<GenerateStageView[]>>,
  setSubmitError: (error: string | null) => void,
  setVariants: (variants: HeroVariant[]) => void
) {
  try {
    const detail = parseRunDetail(await api.runs.detail(runId));
    setActiveNumCandidates(detail.num_candidates ?? 0);
    setFinalImageUrl(detail.final_image_url ?? null);
    setVariants(buildHeroVariants(detail));
    setStages((current) => detail.stages.reduce(mergeStageAccumulator, current));
  } catch (error) {
    setSubmitError(describeError(error));
  }
}

function mergeStageAccumulator(
  current: GenerateStageView[],
  stage: ReturnType<typeof parseStageEvent>
) {
  return mergeStageEvent(current, stage);
}

async function handleSubmit(
  event: FormEvent<HTMLFormElement>,
  handlers: {
    form: GenerateFormState;
    resetFetchedDetail: () => void;
    setActiveNumCandidates: (value: number) => void;
    setErrors: (errors: GenerateFormErrors) => void;
    setFinalImageUrl: (url: string | null) => void;
    setIsSubmitting: (value: boolean) => void;
    setRunId: (runId: string | null) => void;
    setRunStatus: (status: RunStatus | null) => void;
    setSelectedVariantId: (value: string | null) => void;
    setStages: (stages: GenerateStageView[]) => void;
    setStreamError: (error: string | null) => void;
    setSubmitError: (error: string | null) => void;
    setVariants: (variants: HeroVariant[]) => void;
  }
) {
  const {
    form,
    resetFetchedDetail,
    setActiveNumCandidates,
    setErrors,
    setFinalImageUrl,
    setIsSubmitting,
    setRunId,
    setRunStatus,
    setSelectedVariantId,
    setStages,
    setStreamError,
    setSubmitError,
    setVariants,
  } = handlers;
  event.preventDefault();
  const nextErrors = validateGenerateForm(form);
  setErrors(nextErrors);
  if (Object.keys(nextErrors).length) return;

  setActiveNumCandidates(form.numCandidates);
  setFinalImageUrl(null);
  setIsSubmitting(true);
  setRunId(null);
  setRunStatus('queued');
  setSelectedVariantId(null);
  setStages(createPlannedStages(form.expMode, form.maxCriticRounds));
  setStreamError(null);
  setSubmitError(null);
  setVariants([]);
  resetFetchedDetail();

  try {
    const payload = await api.runs.create({
      aspect_ratio: form.aspectRatio,
      caption: form.caption,
      exp_mode: form.expMode,
      figure_language: form.figureLanguage,
      figure_size: form.figureSize,
      image_model: form.imageModel,
      main_model: form.mainModel,
      max_critic_rounds: form.maxCriticRounds,
      method_content: form.methodContent,
      num_candidates: form.numCandidates,
      parent_run_id: form.parentRunId || undefined,
      retrieval_setting: form.retrievalSetting,
    });
    const { runId } = parseRunCreateResponse(payload);
    setRunId(runId);
    setRunStatus('running');
  } catch (error) {
    setRunStatus(null);
    setSubmitError(describeError(error));
  } finally {
    setIsSubmitting(false);
  }
}

function createRunDetailSnapshot(
  runId: string,
  runStatus: RunStatus | null,
  finalImageUrl: string | null,
  stages: GenerateStageView[],
  activeNumCandidates: number
): RunDetailPayload {
  return {
    battles: [],
    final_image_url: finalImageUrl,
    id: runId,
    num_candidates: activeNumCandidates,
    stages: stages.map(toStagePayload),
    status: runStatus ?? 'queued',
  };
}

function toStagePayload(stage: GenerateStageView): RunStagePayload {
  return {
    error: stage.error,
    finished_at: stage.finishedAt,
    image_names: [],
    image_urls: stage.imageUrls,
    payload: stage.rawPayload,
    stage_name: stage.name,
    started_at: stage.startedAt,
    status: stage.status,
  };
}
