import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { cn, panelClass } from './shared';

type ModalSize = 'sm' | 'md' | 'lg';

type ModalProps = {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: ModalSize;
  title?: ReactNode;
};

const sizeStyleMap: Record<ModalSize, string> = {
  lg: 'calc(var(--sp-16) * 12)',
  md: 'calc(var(--sp-16) * 9)',
  sm: 'calc(var(--sp-16) * 6)',
};

export function Modal({ children, className, description, footer, onClose, open, size = 'md', title }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: 'color-mix(in srgb, var(--text-primary) 16%, transparent)' }}
      onMouseDown={onClose}
    >
      <div
        className={cn(panelClass, 'w-full overflow-hidden', className)}
        style={{ maxWidth: sizeStyleMap[size] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="space-y-1">
            {title ? <h2 className="m-0 text-lg font-semibold text-primary">{title}</h2> : null}
            {description ? <p className="m-0 text-sm text-secondary">{description}</p> : null}
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="px-6 py-6">{children}</div>
        {footer ? <footer className="border-t border-border px-6 py-4">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
