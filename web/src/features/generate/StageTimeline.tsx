import { Badge, Card, ErrorText, HelperText, Tag } from '../../components/ui';
import { getStageTone, type RunStatus } from '../../components/ui/shared';
import type { GenerateStageView, RunEventsState } from './types';

type StageTimelineProps = {
  runStatus: RunStatus | null;
  stages: GenerateStageView[];
  streamError?: string | null;
  streamState: RunEventsState;
};

export function StageTimeline({
  runStatus,
  stages,
  streamError,
  streamState,
}: StageTimelineProps) {
  return (
    <Card
      subtitle="Live SSE feed from /api/runs/:id/events with prompt payload snapshots per stage."
      title="Stage timeline"
      actions={
        <div className="flex items-center gap-2">
          <Tag tone={streamState.connectionState === 'open' ? 'ok' : 'neutral'}>
            {streamState.connectionState}
          </Tag>
          {runStatus ? <Tag tone={runStatus === 'running' ? 'ok' : 'neutral'}>{runStatus}</Tag> : null}
        </div>
      }
    >
      {!stages.length ? (
        <HelperText>
          Submit a run to see planner, stylist, visualizer, and critic stages land here.
        </HelperText>
      ) : (
        <StageList stages={stages} />
      )}

      {streamError ? <ErrorText className="mt-4">{streamError}</ErrorText> : null}
    </Card>
  );
}

function StageList({ stages }: { stages: GenerateStageView[] }) {
  return (
    <ol className="m-0 space-y-3 p-0">
      {stages.map((stage) => (
        <StageItem key={stage.name} stage={stage} />
      ))}
    </ol>
  );
}

function StageItem({ stage }: { stage: GenerateStageView }) {
  return (
    <li className="list-none rounded-lg border border-border bg-subtle">
      <details>
        <summary className="cursor-pointer list-none px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <StageDot status={stage.status} />
              <div>
                <p className="m-0 text-sm font-semibold text-primary">
                  {formatStageLabel(stage.name)}
                </p>
                <p className="m-0 text-xs text-secondary">{stage.name}</p>
              </div>
            </div>
            <Badge tone={getStageTone(stage.status)}>{stage.status}</Badge>
          </div>
        </summary>
        <div className="space-y-4 border-t border-border px-4 py-4">
          <StagePromptBlock stage={stage} />
          {stage.error ? <ErrorText>{stage.error}</ErrorText> : null}
          {stage.rawPayload ? <RawPayload payload={stage.rawPayload} /> : null}
        </div>
      </details>
    </li>
  );
}

function StagePromptBlock({ stage }: { stage: GenerateStageView }) {
  if (!stage.promptBlocks.length) {
    return <HelperText>No prompt payload captured for this stage yet.</HelperText>;
  }

  return (
    <div className="space-y-3">
      {stage.promptBlocks.map((block) => (
        <section key={`${stage.name}-${block.label}`}>
          <p className="m-0 text-xs font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-muted">
            {block.label}
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs leading-6 text-secondary">
            {block.value}
          </pre>
        </section>
      ))}
    </div>
  );
}

function RawPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs font-medium text-accent2">
        Raw payload
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs leading-6 text-secondary">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

function StageDot({ status }: { status: GenerateStageView['status'] }) {
  const tone = getStageTone(status);

  return (
    <span
      aria-hidden
      className="inline-flex h-3 w-3 rounded-full border"
      style={{
        backgroundColor:
          tone === 'ok'
            ? 'var(--accent-1)'
            : tone === 'warn'
              ? 'var(--warn)'
              : tone === 'err'
                ? 'var(--danger)'
                : 'var(--border-strong)',
        borderColor: 'transparent',
      }}
    />
  );
}

function formatStageLabel(stageName: string): string {
  if (stageName.startsWith('critic_')) {
    const round = Number(stageName.replace('critic_', '')) + 1;
    return `Critic Round ${round}`;
  }
  return stageName
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}
