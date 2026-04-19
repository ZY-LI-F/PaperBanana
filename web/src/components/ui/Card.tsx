import type { ReactNode } from 'react';
import { cn, panelClass } from './shared';

type CardProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  subtitle?: ReactNode;
  title?: ReactNode;
};

export function Card({ actions, children, className, subtitle, title }: CardProps) {
  const hasHeader = title || subtitle || actions;

  return (
    <section className={cn(panelClass, className)}>
      {hasHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="space-y-1">
            {title ? <h2 className="m-0 text-lg font-semibold text-primary">{title}</h2> : null}
            {subtitle ? <p className="m-0 text-sm text-secondary">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}
