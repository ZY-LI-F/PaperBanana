import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject, type UIEvent } from 'react';
import { Badge, Empty, Tag } from '../../components/ui';
import { cn, panelClass } from '../../components/ui/shared';
import type { Tone } from '../../components/ui/shared';
import { useLogStream } from './useLogStream';
import type { LogFilters, LogStreamEntry } from './types';

type LogViewProps = {
  filters: LogFilters;
  runId: string;
};

const ROW_HEIGHT = 116;
const VIEWPORT_HEIGHT = 560;
const OVERSCAN_ROWS = 6;

const toneByLevel: Record<LogStreamEntry['level'], Tone> = {
  debug: 'neutral',
  error: 'err',
  info: 'ok',
  warn: 'warn',
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function matchesFilters(entry: LogStreamEntry, filters: LogFilters, query: string) {
  const matchesLevel = filters.level === 'all' || entry.level === filters.level;
  const matchesStage = !filters.stage || normalizeText(entry.stage).includes(normalizeText(filters.stage));
  if (!matchesLevel || !matchesStage) return false;
  if (!query) return true;
  const haystack = `${entry.runId} ${entry.stage} ${entry.message}`.toLowerCase();
  return haystack.includes(query);
}

function useVirtualWindow(count: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const end = Math.min(count, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN_ROWS);
  return {
    end,
    offset: start * ROW_HEIGHT,
    onScroll: (event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop),
    start,
    totalHeight: count * ROW_HEIGHT,
  };
}

function LogRow({ entry }: { entry: LogStreamEntry }) {
  return (
    <article className="rounded-md border border-border bg-subtle px-4 py-3" style={{ minHeight: `${ROW_HEIGHT - 8}px` }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={toneByLevel[entry.level]}>{entry.level}</Badge>
        <Tag>{entry.runId}</Tag>
        <span className="text-xs text-muted">{entry.timestamp}</span>
        <span className="text-xs text-secondary">{entry.stage}</span>
      </div>
      <p className="mb-0 mt-3 whitespace-pre-wrap font-mono text-xs text-primary">{entry.message}</p>
    </article>
  );
}

function ConnectionTag({ status }: { status: 'connecting' | 'error' | 'live' }) {
  const meta =
    status === 'live'
      ? { label: 'LIVE', tone: 'ok' as const }
      : status === 'error'
        ? { label: 'RETRYING', tone: 'warn' as const }
        : { label: 'CONNECTING', tone: 'neutral' as const };
  return <Tag tone={meta.tone}>{meta.label}</Tag>;
}

function LogViewHeader({ count, runId, status }: { count: number; runId: string; status: 'connecting' | 'error' | 'live' }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4">
      <div className="space-y-1">
        <p className="m-0 text-base font-semibold text-primary">Live logs</p>
        <p className="m-0 text-xs text-secondary">SSE 订阅全局日志流，前端按等级、阶段与文本即时过滤。</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ConnectionTag status={status} />
        <Tag>{count} lines</Tag>
        {runId ? <Tag tone="warn">run_id {runId}</Tag> : <Tag>all runs</Tag>}
      </div>
    </header>
  );
}

function LogViewport({
  entries,
  onScroll,
  offset,
  totalHeight,
  viewportRef,
}: {
  entries: LogStreamEntry[];
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  offset: number;
  totalHeight: number;
  viewportRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div className="overflow-hidden px-4 py-4">
      <div className="overflow-auto" onScroll={onScroll} ref={viewportRef} style={{ maxHeight: `${VIEWPORT_HEIGHT}px` }}>
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          <div className="space-y-3" style={{ inset: 0, position: 'absolute', top: `${offset}px` }}>
            {entries.map((entry) => (
              <LogRow entry={entry} key={entry.id} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogEmptyState({ error, status }: { error: string | null; status: 'connecting' | 'error' | 'live' }) {
  return (
    <div className="px-4 py-6">
      <Empty description={error ?? '当前过滤条件下还没有命中的日志；保持页面开启后，新事件会自动追加进来。'} title={status === 'connecting' ? '正在等待日志流' : '暂无日志'} />
    </div>
  );
}

export function LogView({ filters, runId }: LogViewProps) {
  const { entries, error, status } = useLogStream({ runId });
  const deferredQuery = useDeferredValue(filters.query);
  const query = normalizeText(deferredQuery);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesFilters(entry, filters, query)),
    [entries, filters, query],
  );
  const { end, offset, onScroll, start, totalHeight } = useVirtualWindow(filteredEntries.length);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const visibleEntries = filteredEntries.slice(start, end);

  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop = Math.max(totalHeight - VIEWPORT_HEIGHT, 0);
  }, [runId, totalHeight]);

  return (
    <section className={cn(panelClass, 'overflow-hidden')}>
      <LogViewHeader count={filteredEntries.length} runId={runId} status={status} />
      {filteredEntries.length ? <LogViewport entries={visibleEntries} offset={offset} onScroll={onScroll} totalHeight={totalHeight} viewportRef={viewportRef} /> : <LogEmptyState error={error} status={status} />}
    </section>
  );
}
