import { useState } from 'react';
import { Button } from './Button';
import { Textarea } from './Textarea';
import { cn, panelClass } from './shared';

type PromptEditorProps = {
  className?: string;
  languageLabel?: string;
  onReuse?: () => void;
  readOnly?: boolean;
  value: string;
};

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
}

export function PromptEditor({ className, languageLabel = 'Prompt', onReuse, readOnly, value }: PromptEditorProps) {
  const [copyLabel, setCopyLabel] = useState('Copy');

  const handleCopy = async () => {
    await copyToClipboard(value);
    setCopyLabel('Copied');
    window.setTimeout(() => setCopyLabel('Copy'), 1200);
  };

  return (
    <section className={cn(panelClass, 'overflow-hidden', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-subtle px-4 py-3">
        <div>
          <p className="m-0 text-2xs font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-muted">{languageLabel}</p>
          <p className="m-0 text-xs text-secondary">Reusable planning and visualizer prompts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void handleCopy()}>
            {copyLabel}
          </Button>
          <Button disabled={!onReuse} size="sm" variant="ghost" onClick={onReuse}>
            Reuse
          </Button>
        </div>
      </header>
      <div className="p-4">
        <Textarea
          readOnly={readOnly}
          value={value}
          className="font-mono text-sm"
          style={{ minHeight: 'calc(var(--sp-16) * 3)', whiteSpace: 'pre-wrap' }}
        />
      </div>
    </section>
  );
}
