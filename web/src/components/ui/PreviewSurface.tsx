import { cn, type Tone } from './shared';

type PreviewSurfaceProps = {
  className?: string;
  label: string;
  subtitle?: string;
  tone?: Tone;
};

const toneColorMap: Record<Tone, string> = {
  err: 'var(--danger)',
  neutral: 'var(--accent-2)',
  ok: 'var(--accent-1)',
  warn: 'var(--warn)',
};

export function PreviewSurface({ className, label, subtitle, tone = 'neutral' }: PreviewSurfaceProps) {
  const accentColor = toneColorMap[tone];

  return (
    <div className={cn('relative flex h-full flex-col justify-between overflow-hidden bg-subtle px-4 py-4', className)}>
      <div className="pointer-events-none absolute left-4 top-4 h-16 w-16 rounded-pill opacity-20" style={{ backgroundColor: accentColor }} />
      <div className="pointer-events-none absolute right-6 top-6 h-8 w-8 rounded-pill bg-accent2 opacity-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-canvas/40 to-transparent" />

      <div className="relative z-10 inline-flex items-center">
        <span
          className="rounded-pill border border-border bg-surface px-3 py-1 text-2xs font-semibold uppercase tracking-[var(--tracking-eyebrow)]"
          style={{ color: accentColor }}
        >
          Preview
        </span>
      </div>

      <div className="relative z-10 space-y-3">
        <div className="space-y-2">
          <p className="m-0 text-lg font-semibold text-primary">{label}</p>
          {subtitle ? <p className="m-0 max-w-xs text-xs text-secondary">{subtitle}</p> : null}
        </div>
        <div className="space-y-2">
          <div className="h-3 w-5/6 rounded-pill opacity-25" style={{ backgroundColor: accentColor }} />
          <div className="h-3 w-2/3 rounded-pill border border-border bg-surface" />
        </div>
      </div>
    </div>
  );
}
