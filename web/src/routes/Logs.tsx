import { useState } from 'react';
import { LogFiltersCard } from '../features/logs/LogFiltersCard';
import { LogView } from '../features/logs/LogView';
import type { LogFilters } from '../features/logs/types';

const initialFilters: LogFilters = {
  level: 'all',
  query: '',
  stage: '',
};

export default function LogsRoute() {
  const [filters, setFilters] = useState<LogFilters>(initialFilters);
  const [draftRunId, setDraftRunId] = useState('');
  const [runId, setRunId] = useState('');

  const resetFilters = () => {
    setDraftRunId('');
    setRunId('');
    setFilters(initialFilters);
  };

  return (
    <div className="space-y-6">
      <LogFiltersCard
        activeRunId={runId}
        draftRunId={draftRunId}
        filters={filters}
        onApply={() => setRunId(draftRunId.trim())}
        onDraftRunIdChange={setDraftRunId}
        onFilterChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
        onReset={resetFilters}
      />
      <LogView filters={filters} runId={runId} />
    </div>
  );
}
