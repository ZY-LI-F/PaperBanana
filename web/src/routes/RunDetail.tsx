import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, Empty, ErrorText, HelperText, RunStatusChip, Tag } from '../components/ui';
import { api } from '../lib/api';
import { ActionsMenu } from '../features/history/ActionsMenu';
import { PromptBlock } from '../features/history/PromptBlock';
import { StageTimeline } from '../features/history/StageTimeline';
import type { HistoryRunDetail } from '../features/history/types';
import { formatTimestamp, parseHistoryRunDetail } from '../features/history/utils';
import { describeError } from '../features/generate/utils';

export default function RunDetailRoute() {
  const navigate = useNavigate();
  const { runId = '' } = useParams();
  const [detail, setDetail] = useState<HistoryRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    void loadDetail(runId, setDetail, setError, setIsLoading, () => !isCancelled);
    return () => {
      isCancelled = true;
    };
  }, [runId]);

  if (isLoading) {
    return (
      <Card subtitle="Loading persisted run details and stage artifacts." title="Run detail">
        <HelperText>Reading run metadata and disk-backed stage payloads...</HelperText>
      </Card>
    );
  }

  if (error || !detail) {
    return (
      <Empty
        action={
          <ButtonLink label="Back to history" to="/history" />
        }
        description={error ?? 'The requested run could not be loaded.'}
        title="Run not found"
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card
        actions={
          <ActionsMenu
            onDeleteSuccess={() => navigate('/history')}
            runId={detail.id}
            status={detail.status}
          />
        }
        subtitle="Timeline, prompts, and artifacts are restored from stored history snapshots."
        title={`Run ${detail.id}`}
      >
        <RunOverview detail={detail} />
      </Card>

      <FinalImageSection detail={detail} />
      <PromptSummary detail={detail} />
      <StageTimeline runId={detail.id} stages={detail.stages} />
    </div>
  );
}

function FinalImageSection({ detail }: { detail: HistoryRunDetail }) {
  const url = detail.finalImageUrl;
  if (!url) return null;
  const fileName = `${detail.id}_final.png`;
  return (
    <Card
      subtitle="Selected final candidate for this run. Click the image to view full size, or use Download to save a local copy."
      title="Final image"
      actions={
        <div className="flex items-center gap-2">
          <a
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-subtle"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            Open full size
          </a>
          <a
            className="rounded-md bg-accent1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            href={url}
            download={fileName}
          >
            Download
          </a>
        </div>
      }
    >
      <div className="flex justify-center rounded-md border border-border bg-subtle p-4">
        <img
          alt={`Final image for run ${detail.id}`}
          className="max-h-[70vh] max-w-full rounded-md object-contain"
          src={url}
        />
      </div>
    </Card>
  );
}

function RunOverview({ detail }: { detail: HistoryRunDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <RunStatusChip status={detail.status} />
        <Tag>{detail.kind}</Tag>
        {detail.parentRunId ? (
          <Link className="text-sm text-accent2" to={`/history/${detail.parentRunId}`}>
            Parent run {detail.parentRunId}
          </Link>
        ) : null}
      </div>
      <p className="m-0 text-sm text-secondary">
        {detail.caption || 'No caption stored for this run.'}
      </p>
      <div className="grid gap-3 text-sm text-secondary md:grid-cols-2 xl:grid-cols-4">
        <RunMeta label="Created" value={formatTimestamp(detail.createdAt)} />
        <RunMeta label="Updated" value={formatTimestamp(detail.updatedAt)} />
        <RunMeta label="Models" value={formatModels(detail)} />
        <RunMeta label="Pipeline" value={`${detail.expMode} / ${detail.numCandidates} candidates`} />
      </div>
      {detail.error ? <ErrorText>{detail.error}</ErrorText> : null}
    </div>
  );
}

function PromptSummary({ detail }: { detail: HistoryRunDetail }) {
  const hasPrompt = Boolean(detail.plannerPrompt || detail.visualizerPrompt);

  return (
    <Card
      subtitle="Top-level prompts mirror the stored `planner_prompt` and `visualizer_prompt` fields."
      title="Prompt summary"
    >
      {hasPrompt ? (
        <div className="space-y-4">
          {detail.plannerPrompt ? (
            <PromptBlock label="Planner Prompt" value={detail.plannerPrompt} />
          ) : null}
          {detail.visualizerPrompt ? (
            <PromptBlock label="Visualizer Prompt" value={detail.visualizerPrompt} />
          ) : null}
        </div>
      ) : (
        <HelperText>No planner or visualizer prompt was stored for this run.</HelperText>
      )}
    </Card>
  );
}

function RunMeta({ label, value }: { label: string; value: string }) {
  return (
    <p className="m-0">
      <span className="font-medium text-primary">{label}:</span> {value}
    </p>
  );
}

function ButtonLink({ label, to }: { label: string; to: string }) {
  return (
    <Link to={to}>
      <span className="inline-flex rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-primary shadow-card">
        {label}
      </span>
    </Link>
  );
}

function formatModels(detail: HistoryRunDetail): string {
  const models = [detail.mainModel, detail.imageModel].filter(Boolean);
  return models.length ? models.join(' / ') : 'N/A';
}

async function loadDetail(
  runId: string,
  setDetail: (detail: HistoryRunDetail | null) => void,
  setError: (error: string | null) => void,
  setIsLoading: (value: boolean) => void,
  isActive: () => boolean,
) {
  setIsLoading(true);
  setError(null);
  try {
    const payload = parseHistoryRunDetail(await api.runs.detail(runId));
    if (!isActive()) return;
    setDetail(payload);
  } catch (error) {
    if (!isActive()) return;
    setError(describeError(error));
    setDetail(null);
  } finally {
    if (isActive()) setIsLoading(false);
  }
}
