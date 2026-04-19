import { Badge } from './Badge';
import { runStatusMeta, type RunStatus } from './shared';

type RunStatusChipProps = {
  status: RunStatus;
};

export function RunStatusChip({ status }: RunStatusChipProps) {
  const meta = runStatusMeta[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
