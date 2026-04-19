import type { HTMLAttributes } from 'react';
import { cn } from './shared';

type HelperTextProps = HTMLAttributes<HTMLParagraphElement>;

export function HelperText({ children, className, ...props }: HelperTextProps) {
  return (
    <p className={cn('m-0 text-xs text-muted', className)} {...props}>
      {children}
    </p>
  );
}
