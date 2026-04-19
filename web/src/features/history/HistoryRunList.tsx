import { Link } from 'react-router-dom';
import { Button, RunStatusChip, Tag } from '../../components/ui';
import type { HistoryRunSummary } from './types';
import { formatTimestamp } from './utils';

type HistoryRunListProps = {
  items: HistoryRunSummary[];
  onDelete: (run: HistoryRunSummary) => void;
};

export function HistoryRunList({ items, onDelete }: HistoryRunListProps) {
  return (
    <div className="space-y-4">
      {items.map((run) => (
        <article
          className="rounded-lg border border-border bg-surface px-6 py-5 shadow-card"
          key={run.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <RunStatusChip status={run.status} />
                <Tag>{run.kind}</Tag>
                {run.parentRunId ? <Tag tone="warn">reused</Tag> : null}
              </div>
              <div>
                <Link className="text-lg font-semibold text-primary" to={`/history/${run.id}`}>
                  {run.id}
                </Link>
                <p className="m-0 mt-1 max-w-3xl text-sm text-secondary">
                  {run.caption || run.methodContent || 'No caption stored for this run.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-primary transition hover:border-border-strong hover:text-accent2"
                to={`/history/${run.id}`}
              >
                Open detail
              </Link>
              <Button variant="danger" onClick={() => onDelete(run)}>
                Delete
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-secondary md:grid-cols-2 xl:grid-cols-4">
            <HistoryMeta label="Updated" value={formatTimestamp(run.updatedAt)} />
            <HistoryMeta label="Created" value={formatTimestamp(run.createdAt)} />
            <HistoryMeta label="Models" value={formatModels(run)} />
            <HistoryMeta label="Pipeline" value={`${run.expMode} / ${run.numCandidates} candidates`} />
          </div>
        </article>
      ))}
    </div>
  );
}

function HistoryMeta({ label, value }: { label: string; value: string }) {
  return (
    <p className="m-0">
      <span className="font-medium text-primary">{label}:</span> {value}
    </p>
  );
}

function formatModels(run: HistoryRunSummary): string {
  const models = [run.mainModel, run.imageModel].filter(Boolean);
  return models.length ? models.join(' / ') : 'N/A';
}
