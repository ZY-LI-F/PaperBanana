import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from './shared';

export type BreadcrumbItem = {
  label: ReactNode;
  to?: string;
};

type BreadcrumbProps = {
  className?: string;
  items: BreadcrumbItem[];
};

export function Breadcrumb({ className, items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex flex-wrap items-center gap-2 text-sm', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span className="flex items-center gap-2" key={`${String(item.label)}-${index}`}>
            {item.to && !isLast ? (
              <Link className="text-secondary transition hover:text-accent2" to={item.to}>
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-primary' : 'text-secondary'}>{item.label}</span>
            )}
            {!isLast ? <span className="text-muted">/</span> : null}
          </span>
        );
      })}
    </nav>
  );
}
