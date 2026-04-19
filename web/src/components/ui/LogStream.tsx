import { useMemo, useState } from 'react';
import { Badge } from './Badge';
import { Empty } from './Empty';
import { Select } from './Select';
import { cn, panelClass, type Option, type Tone } from './shared';

export type LogEntry = {
  id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  stage: string;
  timestamp: string;
};

type LogStreamProps = {
  className?: string;
  entries: LogEntry[];
};

const levelOptions: Option[] = [
  { label: 'All levels', value: 'all' },
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
];

const levelToneMap: Record<LogEntry['level'], Tone> = {
  debug: 'neutral',
  error: 'err',
  info: 'ok',
  warn: 'warn',
};

export function LogStream({ className, entries }: LogStreamProps) {
  const [levelFilter, setLevelFilter] = useState('all');
  const filteredEntries = useMemo(
    () => entries.filter((entry) => levelFilter === 'all' || entry.level === levelFilter),
    [entries, levelFilter],
  );

  return (
    <section className={cn(panelClass, 'overflow-hidden', className)}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4">
        <div>
          <p className="m-0 text-base font-semibold text-primary">Live logs</p>
          <p className="m-0 text-xs text-secondary">Tail-style stream for run and stage diagnostics</p>
        </div>
        <div className="w-full max-w-xs">
          <Select value={levelFilter} options={levelOptions} onChange={(event) => setLevelFilter(event.currentTarget.value)} />
        </div>
      </header>
      {filteredEntries.length ? (
        <div className="space-y-3 overflow-auto px-4 py-4 font-mono text-xs" style={{ maxHeight: 'calc(var(--sp-16) * 6)' }}>
          {filteredEntries.map((entry) => (
            <div className="rounded-md border border-border bg-subtle px-4 py-3" key={entry.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={levelToneMap[entry.level]}>{entry.level}</Badge>
                <span className="text-muted">{entry.timestamp}</span>
                <span className="text-secondary">{entry.stage}</span>
              </div>
              <p className="mb-0 mt-3 whitespace-pre-wrap text-primary">{entry.message}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-6">
          <Empty description="No log entries match the current filter." title="Log stream idle" />
        </div>
      )}
    </section>
  );
}
