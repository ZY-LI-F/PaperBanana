import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './shared';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
  leading?: ReactNode;
  size?: ButtonSize;
  trailing?: ReactNode;
  variant?: ButtonVariant;
};

const sizeClassMap: Record<ButtonSize, string> = {
  lg: 'gap-3 px-6 py-4 text-base',
  md: 'gap-2 px-4 py-3 text-sm',
  sm: 'gap-2 px-3 py-2 text-xs',
};

const variantClassMap: Record<ButtonVariant, string> = {
  danger: 'border-transparent bg-danger text-surface hover:brightness-95',
  ghost: 'border-transparent bg-transparent text-secondary hover:bg-subtle hover:text-primary',
  primary: 'border-transparent bg-accent1 text-surface hover:brightness-95',
  secondary: 'border-border bg-surface text-primary hover:border-border-strong hover:text-accent2',
};

export function Button({
  children,
  className,
  fullWidth,
  leading,
  size = 'md',
  trailing,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-medium transition focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        sizeClassMap[size],
        variantClassMap[variant],
        fullWidth && 'w-full',
        className,
      )}
      type={type}
      {...props}
    >
      {leading ? <span className="inline-flex">{leading}</span> : null}
      <span>{children}</span>
      {trailing ? <span className="inline-flex">{trailing}</span> : null}
    </button>
  );
}
