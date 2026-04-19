import { useState } from 'react';
import { Button, ErrorText } from '../../components/ui';

type PromptBlockProps = {
  label: string;
  value: string;
};

export function PromptBlock({ label, value }: PromptBlockProps) {
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      setCopyError(null);
    } catch (error) {
      setIsCopied(false);
      setCopyError(error instanceof Error ? error.message : 'Clipboard write failed.');
    }
  }

  return (
    <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-muted">
          {label}
        </p>
        <Button size="sm" variant="secondary" onClick={() => void handleCopy()}>
          {isCopied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-secondary">
        {value}
      </pre>
      {copyError ? <ErrorText>{copyError}</ErrorText> : null}
    </section>
  );
}
