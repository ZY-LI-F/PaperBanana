import { Empty } from './Empty';
import { PreviewSurface } from './PreviewSurface';
import { RunStatusChip } from './RunStatusChip';
import { cn, type Tone } from './shared';

export type BattleGridItem = {
  elapsedLabel?: string;
  id: string;
  imageSrc?: string;
  model: string;
  note?: string;
  previewLabel?: string;
  score?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'paused' | 'cancelled';
  tone?: Tone;
};

type BattleGridProps = {
  className?: string;
  items: BattleGridItem[];
};

export function BattleGrid({ className, items }: BattleGridProps) {
  if (!items.length) {
    return <Empty className={className} description="Submit a battle run with two or more image models." title="Battle grid idle" />;
  }

  return (
    <div className={cn('grid gap-4 lg:grid-cols-2 2xl:grid-cols-3', className)}>
      {items.map((item) => (
        <article className="overflow-hidden rounded-lg border border-border bg-surface shadow-card" key={item.id}>
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
            <div>
              <p className="m-0 text-sm font-semibold text-primary">{item.model}</p>
              {item.elapsedLabel ? <p className="m-0 text-xs text-secondary">{item.elapsedLabel}</p> : null}
            </div>
            <RunStatusChip status={item.status} />
          </header>
          <div className="aspect-[4/3] bg-subtle">
            {item.imageSrc ? (
              <img alt={item.model} className="h-full w-full object-cover" loading="lazy" src={item.imageSrc} />
            ) : item.previewLabel ? (
              <PreviewSurface label={item.previewLabel} subtitle={item.note} tone={item.tone} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">Awaiting candidate</div>
            )}
          </div>
          <div className="space-y-2 px-4 py-4">
            {item.score ? <p className="m-0 text-sm text-primary">Score: {item.score}</p> : null}
            {item.note ? <p className="m-0 text-xs text-secondary">{item.note}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
