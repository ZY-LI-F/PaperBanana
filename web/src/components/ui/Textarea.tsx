import type { TextareaHTMLAttributes } from 'react';
import { controlClass, cn } from './shared';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, style, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(controlClass, 'resize-y', className)}
      style={{ minHeight: 'calc(var(--sp-16) + var(--sp-16) + var(--sp-8))', ...style }}
      {...props}
    />
  );
}
