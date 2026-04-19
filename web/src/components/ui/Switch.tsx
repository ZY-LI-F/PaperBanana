import type { ButtonHTMLAttributes } from 'react';
import { cn } from './shared';

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ checked, className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      className={cn('inline-flex rounded-pill border p-1 transition focus-visible:outline-none', className)}
      role="switch"
      style={{
        backgroundColor: checked ? 'color-mix(in srgb, var(--accent-1) 16%, var(--bg-surface))' : 'var(--bg-subtle)',
        borderColor: checked ? 'color-mix(in srgb, var(--accent-1) 32%, var(--border))' : 'var(--border)',
        width: 'calc(var(--sp-8) + var(--sp-4))',
      }}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span className={cn('flex w-full', checked ? 'justify-end' : 'justify-start')}>
        <span
          className="rounded-pill bg-surface shadow-card transition"
          style={{ height: 'calc(var(--sp-4) + var(--sp-1))', width: 'calc(var(--sp-4) + var(--sp-1))' }}
        />
      </span>
    </button>
  );
}
