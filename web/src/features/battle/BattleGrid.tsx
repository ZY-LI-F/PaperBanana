import { Link } from 'react-router-dom';
import { Empty, RunStatusChip, Tag } from '../../components/ui';
import { cn } from '../../components/ui/shared';
import type { BattleCell } from './types';

type BattleGridProps = {
  className?: string;
  items: BattleCell[];
};

function BattlePreview({ item }: { item: BattleCell }) {
  if (item.imageSrc) {
    return <img alt={item.modelLabel} className="h-full w-full object-cover" loading="lazy" src={item.imageSrc} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-subtle px-6 text-center">
      <Tag tone={item.status === 'failed' ? 'err' : item.status === 'running' ? 'ok' : 'neutral'}>{item.status}</Tag>
      <p className="m-0 text-sm text-secondary">{item.error ?? '等待 visualizer 生成最终图片。'}</p>
    </div>
  );
}

export function BattleGrid({ className, items }: BattleGridProps) {
  if (!items.length) {
    return <Empty className={className} description="选择至少两个图像模型并提交后，这里会展开 N 路 battle 对比结果。" title="Battle grid idle" />;
  }

  return (
    <div className={cn('grid gap-4 md:grid-cols-2 2xl:grid-cols-3', className)}>
      {items.map((item) => (
        <article className="overflow-hidden rounded-lg border border-border bg-surface shadow-card" key={item.id}>
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
            <div className="space-y-2">
              <p className="m-0 text-sm font-semibold text-primary">{item.modelLabel}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Tag>{item.elapsedLabel}</Tag>
                <span className="text-xs text-secondary">{item.modelId}</span>
              </div>
            </div>
            <RunStatusChip status={item.status} />
          </header>
          <div className="aspect-[4/3] bg-subtle">
            <BattlePreview item={item} />
          </div>
          <footer className="flex items-center justify-between gap-3 px-4 py-4">
            <p className="m-0 text-xs text-secondary">{item.error ?? '查看详情页可继续审计 planner/stage 产物。'}</p>
            {item.detailHref ? (
              <Link className="text-sm font-medium text-accent2 hover:underline" to={item.detailHref}>
                Expand
              </Link>
            ) : (
              <span className="text-xs text-muted">Waiting for child run</span>
            )}
          </footer>
        </article>
      ))}
    </div>
  );
}
