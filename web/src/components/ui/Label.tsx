import type { LabelHTMLAttributes } from 'react';
import { cn } from './shared';

type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;
};

export function Label({ children, className, required, ...props }: LabelProps) {
  return (
    <label className={cn('text-sm font-medium text-primary', className)} {...props}>
      <span>{children}</span>
      {required ? <span className="ml-1 text-danger">*</span> : null}
    </label>
  );
}
