import type { InputHTMLAttributes } from 'react';
import { cn } from './shared';

type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  valueLabel?: string;
};

export function Slider({ className, value, valueLabel, ...props }: SliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-secondary">
        <span>Intensity</span>
        <span>{valueLabel ?? value}</span>
      </div>
      <input
        className={cn('w-full cursor-pointer accent-accent1', className)}
        style={{ accentColor: 'var(--accent-1)' }}
        type="range"
        value={value}
        {...props}
      />
    </div>
  );
}
