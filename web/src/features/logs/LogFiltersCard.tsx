import { Button, Card, Field, HelperText, Label, Select, Tag } from '../../components/ui';
import { controlClass } from '../../components/ui/shared';
import type { LogFilters } from './types';

const levelOptions = [
  { label: 'All levels', value: 'all' },
  { label: 'Debug', value: 'debug' },
  { label: 'Info', value: 'info' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' },
] as const;

type LogFiltersCardProps = {
  activeRunId: string;
  draftRunId: string;
  filters: LogFilters;
  onApply: () => void;
  onDraftRunIdChange: (value: string) => void;
  onFilterChange: (field: keyof LogFilters, value: string) => void;
  onReset: () => void;
};

function RunFilterField({
  draftRunId,
  onDraftRunIdChange,
}: {
  draftRunId: string;
  onDraftRunIdChange: (value: string) => void;
}) {
  return (
    <Field>
      <Label htmlFor="logs-run-id">Run ID</Label>
      <input className={controlClass} id="logs-run-id" placeholder="留空表示订阅所有 runs" value={draftRunId} onChange={(event) => onDraftRunIdChange(event.currentTarget.value)} />
      <HelperText>点击 Apply 后重建 SSE 连接，后端仅推送该 run 的新增日志。</HelperText>
    </Field>
  );
}

function LocalFilterFields({
  filters,
  onFilterChange,
}: {
  filters: LogFilters;
  onFilterChange: LogFiltersCardProps['onFilterChange'];
}) {
  return (
    <>
      <Field>
        <Label htmlFor="logs-level">Level</Label>
        <Select id="logs-level" options={[...levelOptions]} value={filters.level} onChange={(event) => onFilterChange('level', event.currentTarget.value)} />
      </Field>
      <Field>
        <Label htmlFor="logs-stage">Stage</Label>
        <input className={controlClass} id="logs-stage" placeholder="planner / stylist / visualizer" value={filters.stage} onChange={(event) => onFilterChange('stage', event.currentTarget.value)} />
      </Field>
      <Field>
        <Label htmlFor="logs-query">Free text</Label>
        <input className={controlClass} id="logs-query" placeholder="检索日志正文" value={filters.query} onChange={(event) => onFilterChange('query', event.currentTarget.value)} />
      </Field>
    </>
  );
}

export function LogFiltersCard({
  activeRunId,
  draftRunId,
  filters,
  onApply,
  onDraftRunIdChange,
  onFilterChange,
  onReset,
}: LogFiltersCardProps) {
  return (
    <Card subtitle="全局日志页通过 `/api/logs/events` 建立 SSE 连接；切换 `run_id` 会重新订阅后端过滤流。" title="Logs">
      <form className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]" onSubmit={(event) => { event.preventDefault(); onApply(); }}>
        <RunFilterField draftRunId={draftRunId} onDraftRunIdChange={onDraftRunIdChange} />
        <LocalFilterFields filters={filters} onFilterChange={onFilterChange} />
        <div className="flex flex-wrap items-end gap-3 lg:col-span-4">
          <Button type="submit" variant="primary">
            Apply
          </Button>
          <Button type="button" variant="secondary" onClick={onReset}>
            Reset
          </Button>
          {activeRunId ? <Tag tone="warn">active run_id {activeRunId}</Tag> : <Tag>all runs</Tag>}
        </div>
      </form>
    </Card>
  );
}
