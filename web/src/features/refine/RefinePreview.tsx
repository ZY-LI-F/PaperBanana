import type { ReactNode } from 'react';
import { Button, Tag } from '../../components/ui';

type RefinePreviewProps = {
  downloadName: string | null;
  imageUrl: string | null;
  onDownload: () => void;
  sourceImageUrl: string | null;
};

export function RefinePreview({
  downloadName,
  imageUrl,
  onDownload,
  sourceImageUrl,
}: RefinePreviewProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <PreviewPane imageUrl={sourceImageUrl} tagTone="neutral" title="Before" />
      <PreviewPane
        action={imageUrl && downloadName ? (
          <Button size="sm" variant="secondary" onClick={onDownload}>
            Download {downloadName}
          </Button>
        ) : null}
        imageUrl={imageUrl}
        tagTone={imageUrl ? 'ok' : 'neutral'}
        title="After"
      />
    </div>
  );
}

export function RefineStatus({
  runId,
  statusMessage,
}: {
  runId: string | null;
  statusMessage: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-subtle px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tag tone="ok">Completed</Tag>
        {runId ? <span className="text-sm text-primary">Run {runId}</span> : null}
      </div>
      <p className="m-0 mt-2 text-sm text-secondary">{statusMessage}</p>
    </div>
  );
}

function PreviewPane({
  action,
  imageUrl,
  tagTone,
  title,
}: {
  action?: ReactNode;
  imageUrl: string | null;
  tagTone: 'neutral' | 'ok';
  title: string;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tag tone={tagTone}>{title}</Tag>
          <span className="text-xs text-muted">
            {imageUrl ? 'Preview ready' : 'Waiting for image'}
          </span>
        </div>
        {action}
      </div>
      <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-subtle px-4 py-4">
        {imageUrl ? (
          <img alt={title} className="max-h-[28rem] w-full object-contain" src={imageUrl} />
        ) : (
          <p className="m-0 max-w-sm text-center text-sm text-secondary">
            {title === 'Before'
              ? 'Upload a diagram to review the input asset here.'
              : 'The refined result will appear here after the request succeeds.'}
          </p>
        )}
      </div>
    </section>
  );
}
