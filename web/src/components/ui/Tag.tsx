import type { HTMLAttributes } from 'react';
import { cn, getToneStyle, type Tone } from './shared';

type TagProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

export function Tag({ children, className, tone = 'neutral', ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-3 py-1 text-2xs font-semibold uppercase tracking-[var(--tracking-eyebrow)]',
        className,
      )}
      style={getToneStyle(tone)}
      {...props}
    >
      {children}
    </span>
  );
}
