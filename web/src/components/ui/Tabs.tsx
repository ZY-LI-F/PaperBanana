import { useState, type ReactNode } from 'react';
import { cn } from './shared';

export type TabItem = {
  content: ReactNode;
  key: string;
  label: string;
  meta?: ReactNode;
};

type TabsProps = {
  activeKey?: string;
  className?: string;
  items: TabItem[];
  onChange?: (key: string) => void;
};

export function Tabs({ activeKey, className, items, onChange }: TabsProps) {
  const [internalKey, setInternalKey] = useState(items[0]?.key);
  const currentKey = activeKey ?? internalKey;
  const currentTab = items.find((item) => item.key === currentKey) ?? items[0];

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const isActive = item.key === currentKey;

          return (
            <button
              className={cn(
                'inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-sm font-medium transition',
                isActive ? 'border-accent1 bg-subtle text-accent1' : 'border-border bg-surface text-secondary hover:text-primary',
              )}
              key={item.key}
              type="button"
              onClick={() => {
                setInternalKey(item.key);
                onChange?.(item.key);
              }}
            >
              <span>{item.label}</span>
              {item.meta ? <span className="text-xs text-muted">{item.meta}</span> : null}
            </button>
          );
        })}
      </div>
      <div>{currentTab?.content}</div>
    </section>
  );
}
