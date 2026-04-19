import { Card, HelperText, ImageGallery, Tag } from '../../components/ui';
import type { RunStatus } from '../../components/ui/shared';
import type { GenerateGalleryImage } from './types';

type FinalGalleryProps = {
  images: GenerateGalleryImage[];
  runId: string | null;
  runStatus: RunStatus | null;
};

export function FinalGallery({ images, runId, runStatus }: FinalGalleryProps) {
  return (
    <Card
      subtitle="Final artifacts resolved from the runs API image endpoints."
      title="Final gallery"
      actions={
        <div className="flex items-center gap-2">
          {runId ? <Tag tone="neutral">{runId.slice(0, 8)}</Tag> : null}
          {runStatus ? <Tag tone={runStatus === 'succeeded' ? 'ok' : 'neutral'}>{runStatus}</Tag> : null}
        </div>
      }
    >
      {!runId ? (
        <HelperText>
          Completed run artifacts appear here once the SSE stream reaches a terminal state.
        </HelperText>
      ) : null}
      <ImageGallery images={images} />
    </Card>
  );
}
