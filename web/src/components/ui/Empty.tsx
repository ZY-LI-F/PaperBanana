import type { ReactNode } from 'react';
import { cn } from './shared';

type EmptyProps = {
  action?: ReactNode;
  className?: string;
  description: ReactNode;
  title: ReactNode;
};

export function Empty({ action, className, description, title }: EmptyProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border bg-subtle px-6 py-8 text-center shadow-card',
        className,
      )}
    >
      <p className="m-0 text-lg font-semibold text-primary">{title}</p>
      <p className="mx-auto mt-2 text-sm text-secondary" style={{ maxWidth: 'calc(var(--sp-16) * 10)' }}>
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
