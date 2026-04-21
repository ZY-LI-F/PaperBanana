import { refImageUrl, type RefRow, type RefTask } from '../../api/refs';
import { Button } from '../ui/Button';
import { Empty } from '../ui/Empty';
import { Tag } from '../ui/Tag';
import { panelClass } from '../ui/shared';
import { findThumbnail, getCategoryLabel } from './constants';

type RefListProps = {
  refs: RefRow[];
  task: RefTask;
  onDelete: (task: RefTask, row: RefRow) => void;
  onEdit: (task: RefTask, row: RefRow) => void;
  onManageImages: (task: RefTask, row: RefRow) => void;
};

export function RefList({ refs, task, onDelete, onEdit, onManageImages }: RefListProps) {
  if (!refs.length) {
    return (
      <Empty
        description="当前标签下还没有条目。可先创建 overlay ref，随后补充主图与变体图。"
        title="暂无参考条目 / No refs yet"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {refs.map((row) => (
        <RefCard
          key={row.id}
          row={row}
          task={task}
          onDelete={onDelete}
          onEdit={onEdit}
          onManageImages={onManageImages}
        />
      ))}
    </div>
  );
}

type RefCardProps = Omit<RefListProps, 'refs'> & {
  row: RefRow;
};

function RefCard({ row, task, onDelete, onEdit, onManageImages }: RefCardProps) {
  const thumbnail = findThumbnail(row);
  const categoryLabel = getCategoryLabel(row.category);

  return (
    <article className={`${panelClass} overflow-hidden`}>
      <div className="grid gap-4 p-4 md:grid-cols-[104px_minmax(0,1fr)_auto] md:items-center">
        <div className="overflow-hidden rounded-lg border border-border bg-subtle">
          {thumbnail ? (
            <img
              alt={`${row.id} thumbnail`}
              className="h-24 w-24 object-cover md:h-[104px] md:w-[104px]"
              loading="lazy"
              src={refImageUrl(task, row.id, thumbnail)}
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center text-xs text-muted md:h-[104px] md:w-[104px]">
              No image
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={row._baseline ? 'neutral' : 'ok'}>
              {row._baseline ? 'Baseline' : 'Overlay'}
            </Tag>
            {categoryLabel ? <Tag>{categoryLabel}</Tag> : null}
            <Tag>
              {row.images.length} image{row.images.length === 1 ? '' : 's'}
            </Tag>
          </div>

          <div className="space-y-1">
            <p className="m-0 font-mono text-xs text-muted">{row.id}</p>
            <p className="m-0 max-h-12 overflow-hidden text-sm leading-6 text-primary">
              {row.visual_intent}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => onEdit(task, row)}>
            Edit
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onManageImages(task, row)}>
            Manage images
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDelete(task, row)}>
            Delete
          </Button>
        </div>
      </div>
    </article>
  );
}
