import type { HTMLAttributes } from 'react';
import { cn, getToneStyle, type Tone } from './shared';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

export function Badge({ children, className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-pill border px-3 py-2 text-xs font-medium', className)}
      style={getToneStyle(tone)}
      {...props}
    >
      {children}
    </span>
  );
}
