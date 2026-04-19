import { useParams } from 'react-router-dom';
import { Card, Tag } from '../components/ui';
import { RoutePlaceholder } from './RoutePlaceholder';

export default function RunDetailRoute() {
  const { runId = 'pending' } = useParams();

  return (
    <RoutePlaceholder description="Per-stage audit trail and recovery actions land in T09." eyebrow="T09" title="Run Detail">
      <Card subtitle="This route already resolves dynamic params and inherits the shell breadcrumb." title={`Run ${runId}`}>
        <div className="flex flex-wrap gap-3">
          <Tag tone="neutral">run_id</Tag>
          <span className="text-sm text-secondary">{runId}</span>
        </div>
      </Card>
    </RoutePlaceholder>
  );
}
