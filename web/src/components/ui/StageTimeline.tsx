import { useState } from 'react';
import { Badge } from './Badge';
import { Button } from './Button';
import { cn, getStageTone, panelClass, type StageStatus } from './shared';

export type StageTimelineItem = {
  detail: string;
  name: string;
  status: StageStatus;
};

type StageTimelineProps = {
  className?: string;
  stages: StageTimelineItem[];
};

function StageDot({ status }: { status: StageStatus }) {
  const tone = getStageTone(status);

  return (
    <span
      className="inline-flex rounded-pill border"
      style={{
        ...{ height: 'var(--sp-3)', width: 'var(--sp-3)' },
        backgroundColor: tone === 'neutral' ? 'var(--border-strong)' : tone === 'warn' ? 'var(--warn)' : tone === 'err' ? 'var(--danger)' : 'var(--accent-1)',
        borderColor: 'transparent',
      }}
      aria-hidden
    />
  );
}

export function StageTimeline({ className, stages }: StageTimelineProps) {
  const [activeStage, setActiveStage] = useState(stages[0]?.name);
  const currentStage = stages.find((stage) => stage.name === activeStage) ?? stages[0];

  return (
    <section className={cn(panelClass, 'overflow-hidden', className)}>
      <div className="flex flex-wrap gap-3 border-b border-border px-4 py-4">
        {stages.map((stage) => {
          const tone = getStageTone(stage.status);
          const isActive = stage.name === currentStage?.name;

          return (
            <Button
              className={cn('justify-start border', isActive && 'border-border-strong')}
              key={stage.name}
              variant="ghost"
              onClick={() => setActiveStage(stage.name)}
            >
              <span className="inline-flex items-center gap-2" style={{ color: tone === 'neutral' ? 'var(--text-secondary)' : undefined }}>
                <StageDot status={stage.status} />
                <span>{stage.name}</span>
              </span>
            </Button>
          );
        })}
      </div>
      {currentStage ? (
        <div className="space-y-3 px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="m-0 text-base font-semibold text-primary">{currentStage.name}</h3>
            <Badge tone={getStageTone(currentStage.status)}>{currentStage.status}</Badge>
          </div>
          <p className="m-0 text-sm text-secondary">{currentStage.detail}</p>
        </div>
      ) : null}
    </section>
  );
}
