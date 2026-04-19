import type { HTMLAttributes } from 'react';
import { cn } from './shared';

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  height?: string;
  width?: string;
};

export function Skeleton({ className, height = 'var(--sp-4)', width = '100%', ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-subtle', className)}
      style={{ height, width }}
      {...props}
    />
  );
}
