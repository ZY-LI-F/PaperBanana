import {
  Badge,
  Card,
  Empty,
  ErrorText,
  HelperText,
  ImageGallery,
} from '../../components/ui';
import { getStageTone } from '../../components/ui/shared';
import type { HistoryStage } from './types';
import { buildStagePromptGroups, formatStageLabel, formatTimestamp } from './utils';
import { PromptBlock } from './PromptBlock';

type StageTimelineProps = {
  runId: string;
  stages: HistoryStage[];
};

export function StageTimeline({ runId, stages }: StageTimelineProps) {
  return (
    <Card
      subtitle="Completed stage payloads and images are loaded from disk-backed history endpoints."
      title="Stage timeline"
    >
      {!stages.length ? (
        <Empty
          description="Stage payloads will appear here once the selected run has recorded snapshots."
          title="No stage artifacts yet"
        />
      ) : (
        <ol className="m-0 space-y-4 p-0">
          {stages.map((stage, index) => (
            <StageCard
              defaultOpen={index === 0 || stage.status === 'running'}
              key={`${runId}-${stage.name}`}
              runId={runId}
              stage={stage}
            />
          ))}
        </ol>
      )}
    </Card>
  );
}

function StageCard({
  defaultOpen,
  runId,
  stage,
}: {
  defaultOpen: boolean;
  runId: string;
  stage: HistoryStage;
}) {
  const prompts = buildStagePromptGroups(stage);
  const images = stage.imageUrls.map((src, index) => ({
    id: `${runId}-${stage.name}-${index}`,
    src,
    subtitle: formatStageLabel(stage.name),
    title: `Artifact ${index + 1}`,
  }));

  return (
    <li className="list-none overflow-hidden rounded-lg border border-border bg-subtle">
      <details open={defaultOpen}>
        <summary className="cursor-pointer list-none px-4 py-4">
          <StageSummary stage={stage} />
        </summary>
        <div className="space-y-4 border-t border-border px-4 py-4">
          <StageMeta stage={stage} />
          <PromptSection entries={prompts.input} title="Prompt In" />
          <PromptSection entries={prompts.output} title="Prompt Out" />
          {stage.error ? <ErrorText>{stage.error}</ErrorText> : null}
          {images.length ? (
            <ImageGallery images={images} />
          ) : (
            <HelperText>No image artifacts were stored for this stage.</HelperText>
          )}
        </div>
      </details>
    </li>
  );
}

function StageSummary({ stage }: { stage: HistoryStage }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="m-0 text-sm font-semibold text-primary">
          {formatStageLabel(stage.name)}
        </p>
        <p className="m-0 text-xs text-secondary">{stage.name}</p>
      </div>
      <Badge tone={getStageTone(stage.status)}>{stage.status}</Badge>
    </div>
  );
}

function StageMeta({ stage }: { stage: HistoryStage }) {
  return (
    <div className="grid gap-2 text-sm text-secondary md:grid-cols-3">
      <p className="m-0">
        <span className="font-medium text-primary">Started:</span>{' '}
        {formatTimestamp(stage.startedAt)}
      </p>
      <p className="m-0">
        <span className="font-medium text-primary">Finished:</span>{' '}
        {formatTimestamp(stage.finishedAt)}
      </p>
      <p className="m-0">
        <span className="font-medium text-primary">Artifacts:</span>{' '}
        {stage.imageUrls.length}
      </p>
    </div>
  );
}

function PromptSection({
  entries,
  title,
}: {
  entries: ReturnType<typeof buildStagePromptGroups>['input'];
  title: string;
}) {
  if (!entries.length) {
    return <HelperText>{title} not captured for this stage.</HelperText>;
  }

  return (
    <section className="space-y-3">
      <p className="m-0 text-sm font-semibold text-primary">{title}</p>
      <div className="space-y-3">
        {entries.map((entry) => (
          <PromptBlock key={`${title}-${entry.label}`} label={entry.label} value={entry.value} />
        ))}
      </div>
    </section>
  );
}
