import type { HTMLAttributes } from 'react';
import { cn } from './shared';

type FieldProps = HTMLAttributes<HTMLDivElement>;

export function Field({ children, className, ...props }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      {children}
    </div>
  );
}
