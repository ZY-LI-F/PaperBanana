import type { HTMLAttributes } from 'react';
import { cn } from './shared';

type ErrorTextProps = HTMLAttributes<HTMLParagraphElement>;

export function ErrorText({ children, className, ...props }: ErrorTextProps) {
  return (
    <p className={cn('m-0 text-xs text-danger', className)} {...props}>
      {children}
    </p>
  );
}
