import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  Empty,
  ErrorText,
  Tag,
} from '../components/ui';
import {
  HistoryFiltersCard,
  type HistoryFilterState,
} from '../features/history/HistoryFiltersCard';
import { HistoryRunList } from '../features/history/HistoryRunList';
import { api } from '../lib/api';
import type { HistoryListResponse, HistoryRunSummary } from '../features/history/types';
import { parseHistoryList } from '../features/history/utils';
import { describeError } from '../features/generate/utils';

const PAGE_SIZE = 20;
const initialFilters: HistoryFilterState = {
  kind: 'all',
  query: '',
  status: 'all',
};

export default function HistoryRoute() {
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [activeFilters, setActiveFilters] = useState(initialFilters);
  const [history, setHistory] = useState<HistoryListResponse>({
    items: [],
    limit: PAGE_SIZE,
    offset: 0,
    total: 0,
  });
  const [deleteTarget, setDeleteTarget] = useState<HistoryRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    void loadFirstPage(activeFilters, setError, setHistory, setIsLoading, () => !isCancelled);
    return () => {
      isCancelled = true;
    };
  }, [activeFilters]);

  const hasMore = history.items.length < history.total;

  return (
    <div className="space-y-6">
      <HistoryHeader total={history.total} />
      <HistoryFiltersCard
        draftFilters={draftFilters}
        isLoading={isLoading}
        onApply={() => setActiveFilters({ ...draftFilters, query: draftFilters.query.trim() })}
        onChange={(field, value) =>
          setDraftFilters((current) => ({ ...current, [field]: value }))
        }
        onReset={() => {
          setDraftFilters(initialFilters);
          setActiveFilters(initialFilters);
        }}
      />

      {error ? <ErrorText>{error}</ErrorText> : null}

      {!history.items.length && !isLoading ? (
        <Empty
          description="Try a broader search or clear filters to see stored runs."
          title="No matching runs"
        />
      ) : (
        <HistoryRunList items={history.items} onDelete={setDeleteTarget} />
      )}

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            disabled={isLoadingMore}
            variant="secondary"
            onClick={() =>
              void loadMore(activeFilters, history.items.length, setError, setHistory, setIsLoadingMore)
            }
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      ) : null}

      <Dialog
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete run'}
        description="Deleting a run also removes its stage snapshots and stored image files."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() =>
          void deleteRun(deleteTarget, setDeleteTarget, setError, setHistory, setIsDeleting)
        }
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.id ?? 'run'}?`}
      />
    </div>
  );
}

function HistoryHeader({ total }: { total: number }) {
  return (
    <section className="rounded-lg border border-border bg-surface px-6 py-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Tag tone="ok">History</Tag>
          <div>
            <h1 className="m-0 text-2xl font-semibold text-primary">Stored runs</h1>
            <p className="m-0 text-sm text-secondary">
              Search, filter, inspect, reuse, resume, and delete disk-backed runs.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-subtle px-4 py-3 text-right">
          <p className="m-0 text-xs uppercase tracking-[var(--tracking-eyebrow)] text-muted">
            Total matches
          </p>
          <p className="m-0 text-2xl font-semibold text-primary">{total}</p>
        </div>
      </div>
    </section>
  );
}

async function loadFirstPage(
  filters: HistoryFilterState,
  setError: (error: string | null) => void,
  setHistory: (state: HistoryListResponse) => void,
  setIsLoading: (value: boolean) => void,
  isActive: () => boolean,
) {
  setIsLoading(true);
  setError(null);
  try {
    const nextHistory = await fetchHistoryPage(filters, 0);
    if (!isActive()) return;
    setHistory(nextHistory);
  } catch (error) {
    if (!isActive()) return;
    setError(describeError(error));
  } finally {
    if (isActive()) setIsLoading(false);
  }
}

async function loadMore(
  filters: HistoryFilterState,
  offset: number,
  setError: (error: string | null) => void,
  setHistory: (updater: (current: HistoryListResponse) => HistoryListResponse) => void,
  setIsLoadingMore: (value: boolean) => void,
) {
  setIsLoadingMore(true);
  setError(null);
  try {
    const page = await fetchHistoryPage(filters, offset);
    setHistory((current) => ({
      ...page,
      items: [...current.items, ...page.items.filter((item) => !current.items.some((existing) => existing.id === item.id))],
    }));
  } catch (error) {
    setError(describeError(error));
  } finally {
    setIsLoadingMore(false);
  }
}

async function deleteRun(
  target: HistoryRunSummary | null,
  setDeleteTarget: (target: HistoryRunSummary | null) => void,
  setError: (error: string | null) => void,
  setHistory: (updater: (current: HistoryListResponse) => HistoryListResponse) => void,
  setIsDeleting: (value: boolean) => void,
) {
  if (!target) return;
  setIsDeleting(true);
  setError(null);
  try {
    await api.runs.delete(target.id);
    setDeleteTarget(null);
    setHistory((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== target.id),
      total: Math.max(current.total - 1, 0),
    }));
  } catch (error) {
    setError(describeError(error));
  } finally {
    setIsDeleting(false);
  }
}

async function fetchHistoryPage(filters: HistoryFilterState, offset: number) {
  return parseHistoryList(
    await api.runs.list({
      kind: filters.kind === 'all' ? undefined : filters.kind,
      limit: PAGE_SIZE,
      offset,
      q: filters.query,
      status: filters.status === 'all' ? undefined : filters.status,
    }),
  );
}
