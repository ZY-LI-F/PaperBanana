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
import { Tag } from '../components/ui';
import { api } from '../lib/api';
import { GenerateForm } from '../features/generate/GenerateForm';
import { FinalGallery } from '../features/generate/FinalGallery';
import { StageTimeline } from '../features/generate/StageTimeline';
import { createInitialFormState, formReducer } from '../features/generate/formReducer';
import { useRunEvents } from '../features/generate/hooks/useRunEvents';
import { useGeneratePrefillStore } from '../features/generate/store';
import type {
  GenerateFormErrors,
  GenerateFormState,
  GenerateGalleryImage,
  GenerateStageView,
  ProviderRecord,
  RunStatus,
} from '../features/generate/types';
import {
  buildGallery,
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
  const [gallery, setGallery] = useState<GenerateGalleryImage[]>([]);
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
    void loadModelData(
      setProviders,
      setModelLoadError,
      (mainModel, imageModel) =>
        dispatch({ imageModel, mainModel, type: 'applyModelDefaults' }),
    );
  }, []);

  const streamState = useRunEvents({
    enabled: Boolean(runId && !isTerminalRunStatus(runStatus)),
    onError: setStreamError,
    onRun: (payload) => {
      const event = parseRunEvent(payload);
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
    void loadRunDetail(runId, setGallery, setStages, setSubmitError);
  }, [runId, runStatus]);

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
                Method text, caption, retrieval settings, model pickers, live stage telemetry, and final artifact gallery.
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
            setErrors,
            setGallery,
            setIsSubmitting,
            setRunId,
            setRunStatus,
            setStages,
            setStreamError,
            setSubmitError,
            resetFetchedDetail: () => {
              fetchedDetailRef.current = null;
            },
          })
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
        <StageTimeline
          runStatus={runStatus}
          stages={stages}
          streamError={streamError}
          streamState={streamState}
        />
        <FinalGallery images={gallery} runId={runId} runStatus={runStatus} />
      </div>
    </div>
  );
}

async function loadModelData(
  setProviders: (providers: ProviderRecord[]) => void,
  setModelLoadError: (error: string | null) => void,
  applyDefaults: (mainModel: string, imageModel: string) => void,
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
  setGallery: (images: GenerateGalleryImage[]) => void,
  setStages: Dispatch<SetStateAction<GenerateStageView[]>>,
  setSubmitError: (error: string | null) => void,
) {
  try {
    const detail = parseRunDetail(await api.runs.detail(runId));
    setGallery(buildGallery(detail));
    setStages((current) => detail.stages.reduce(mergeStageAccumulator, current));
  } catch (error) {
    setSubmitError(describeError(error));
  }
}

function mergeStageAccumulator(
  current: GenerateStageView[],
  stage: ReturnType<typeof parseStageEvent>,
) {
  return mergeStageEvent(current, stage);
}

async function handleSubmit(
  event: FormEvent<HTMLFormElement>,
  handlers: {
    form: GenerateFormState;
    resetFetchedDetail: () => void;
    setErrors: (errors: GenerateFormErrors) => void;
    setGallery: (images: GenerateGalleryImage[]) => void;
    setIsSubmitting: (value: boolean) => void;
    setRunId: (runId: string | null) => void;
    setRunStatus: (status: RunStatus | null) => void;
    setStages: (stages: GenerateStageView[]) => void;
    setStreamError: (error: string | null) => void;
    setSubmitError: (error: string | null) => void;
  },
) {
  const {
    form,
    resetFetchedDetail,
    setErrors,
    setGallery,
    setIsSubmitting,
    setRunId,
    setRunStatus,
    setStages,
    setStreamError,
    setSubmitError,
  } = handlers;
  event.preventDefault();
  const nextErrors = validateGenerateForm(form);
  setErrors(nextErrors);
  if (Object.keys(nextErrors).length) return;

  setGallery([]);
  setIsSubmitting(true);
  setRunId(null);
  setRunStatus('queued');
  setStages(createPlannedStages(form.expMode, form.maxCriticRounds));
  setStreamError(null);
  setSubmitError(null);
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
