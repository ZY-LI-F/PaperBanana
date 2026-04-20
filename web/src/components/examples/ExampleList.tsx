import type { ExampleRow } from '../../api/examples';
import { exampleImageUrl } from '../../api/examples';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { panelClass } from '../ui/shared';
import { priorityBadgeText } from './PrioritySelect';

type ExampleListProps = {
  examples: ExampleRow[];
  onDelete: (example: ExampleRow) => void;
  onEdit: (example: ExampleRow) => void;
  onUploadImage: (example: ExampleRow) => void;
};

export function ExampleList({
  examples,
  onDelete,
  onEdit,
  onUploadImage,
}: ExampleListProps) {
  if (!examples.length) {
    return (
      <section className={`${panelClass} px-6 py-8`}>
        <p className="m-0 text-sm text-secondary">暂无示例，可使用上方按钮创建第一条记录。</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {examples.map((example) => {
        const highPriority = example.priority === 3;
        return (
          <article
            className={`${panelClass} overflow-hidden`}
            key={example.id}
            style={highPriority ? highPriorityStyle : undefined}
          >
            <div className="grid gap-4 p-4 md:grid-cols-[160px_minmax(0,1fr)_auto] md:items-center">
              <div className="overflow-hidden rounded-lg border border-border bg-subtle">
                {example.image_path ? (
                  <img
                    alt={example.title_en}
                    className="h-32 w-full object-cover"
                    src={exampleImageUrl(example.id)}
                  />
                ) : (
                  <div className="flex h-32 items-center justify-center text-xs text-muted">
                    No image
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={highPriority ? 'ok' : 'neutral'}>
                    {priorityBadgeText(example.priority)}
                  </Badge>
                  <span className="text-xs font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-muted">
                    {example.discipline}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="m-0 truncate text-base font-semibold text-primary">{example.title_zh}</p>
                  <p className="m-0 truncate text-sm text-secondary">{example.title_en}</p>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => onEdit(example)}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onUploadImage(example)}>
                  Upload image
                </Button>
                <Button size="sm" variant="danger" onClick={() => onDelete(example)}>
                  Delete
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

const highPriorityStyle = {
  borderColor: 'color-mix(in srgb, var(--accent-1) 42%, var(--border))',
  boxShadow: '0 18px 44px rgba(12, 29, 53, 0.08)',
};
