import type { ReactNode } from 'react';
import { Button } from './Button';
import { Badge } from './Badge';
import { cn, panelClass, type Tone } from './shared';

type ToastProps = {
  action?: ReactNode;
  className?: string;
  description: ReactNode;
  onClose?: () => void;
  title: ReactNode;
  tone?: Tone;
};

export function Toast({ action, className, description, onClose, title, tone = 'neutral' }: ToastProps) {
  return (
    <section className={cn(panelClass, 'flex items-start gap-4 px-4 py-4', className)}>
      <Badge tone={tone}>Toast</Badge>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-semibold text-primary">{title}</p>
        <p className="mt-1 text-sm text-secondary">{description}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
      {onClose ? (
        <Button size="sm" variant="ghost" onClick={onClose}>
          Dismiss
        </Button>
      ) : null}
    </section>
  );
}
