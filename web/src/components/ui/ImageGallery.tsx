import { useState } from 'react';
import { Badge } from './Badge';
import { Empty } from './Empty';
import { Modal } from './Modal';
import { cn, type Tone } from './shared';

export type GalleryImage = {
  id: string;
  src: string;
  subtitle?: string;
  title: string;
  tone?: Tone;
};

type ImageGalleryProps = {
  className?: string;
  images: GalleryImage[];
};

export function ImageGallery({ className, images }: ImageGalleryProps) {
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const activeImage = images.find((image) => image.id === activeImageId) ?? null;

  if (!images.length) {
    return <Empty className={className} description="Generated candidates will appear here as the run completes." title="No images yet" />;
  }

  return (
    <>
      <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', className)}>
        {images.map((image) => (
          <button
            className="overflow-hidden rounded-lg border border-border bg-surface text-left shadow-card transition hover:border-border-strong"
            key={image.id}
            type="button"
            onClick={() => setActiveImageId(image.id)}
          >
            <div className="aspect-[4/3] overflow-hidden bg-subtle">
              <img alt={image.title} className="h-full w-full object-cover" loading="lazy" src={image.src} />
            </div>
            <div className="space-y-2 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-sm font-semibold text-primary">{image.title}</p>
                {image.tone ? <Badge tone={image.tone}>{image.tone}</Badge> : null}
              </div>
              {image.subtitle ? <p className="m-0 text-xs text-secondary">{image.subtitle}</p> : null}
            </div>
          </button>
        ))}
      </div>
      <Modal description={activeImage?.subtitle} onClose={() => setActiveImageId(null)} open={Boolean(activeImage)} size="lg" title={activeImage?.title}>
        {activeImage ? (
          <div className="overflow-hidden rounded-lg border border-border bg-subtle">
            <img alt={activeImage.title} className="h-auto w-full object-contain" src={activeImage.src} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
