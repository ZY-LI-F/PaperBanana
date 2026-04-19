import { Button, Card, Field, Label, Select } from '../../components/ui';
import { controlClass } from '../../components/ui/shared';

const kindOptions = [
  { label: 'All run types', value: 'all' },
  { label: 'Generate', value: 'generate' },
  { label: 'Battle', value: 'battle' },
  { label: 'Refine', value: 'refine' },
];
const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Queued', value: 'queued' },
  { label: 'Running', value: 'running' },
  { label: 'Succeeded', value: 'succeeded' },
  { label: 'Failed', value: 'failed' },
  { label: 'Paused', value: 'paused' },
  { label: 'Cancelled', value: 'cancelled' },
];

export type HistoryFilterState = {
  kind: string;
  query: string;
  status: string;
};

type HistoryFiltersCardProps = {
  draftFilters: HistoryFilterState;
  isLoading: boolean;
  onApply: () => void;
  onChange: (field: keyof HistoryFilterState, value: string) => void;
  onReset: () => void;
};

export function HistoryFiltersCard({
  draftFilters,
  isLoading,
  onApply,
  onChange,
  onReset,
}: HistoryFiltersCardProps) {
  return (
    <Card subtitle="Searches across caption, method text, and prompt snapshots." title="Filters">
      <form
        className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,0.8fr))_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          onApply();
        }}
      >
        <Field>
          <Label htmlFor="history-query">Search</Label>
          <input
            className={controlClass}
            id="history-query"
            placeholder="Run id, caption, method content, planner prompt..."
            value={draftFilters.query}
            onChange={(event) => onChange('query', event.currentTarget.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="history-kind">Run type</Label>
          <Select
            id="history-kind"
            options={kindOptions}
            value={draftFilters.kind}
            onChange={(event) => onChange('kind', event.currentTarget.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="history-status">Status</Label>
          <Select
            id="history-status"
            options={statusOptions}
            value={draftFilters.status}
            onChange={(event) => onChange('status', event.currentTarget.value)}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Button disabled={isLoading} type="submit">
            Apply
          </Button>
          <Button type="button" variant="secondary" onClick={onReset}>
            Reset
          </Button>
        </div>
      </form>
    </Card>
  );
}
