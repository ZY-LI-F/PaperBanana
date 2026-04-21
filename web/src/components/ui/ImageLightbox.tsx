import { useEffect } from 'react';
import { createPortal } from 'react-dom';

type ImageLightboxProps = {
  alt?: string;
  onClose: () => void;
  src: string | null;
};

function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);
}

export function ImageLightbox({ alt, onClose, src }: ImageLightboxProps) {
  useEscapeClose(Boolean(src), onClose);

  if (!src) return null;

  return createPortal(
    <div
      aria-label={alt ?? '图片预览 / Image preview'}
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 py-4"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          aria-label="关闭 / Close"
          className="absolute right-0 top-0 z-10 inline-flex h-10 w-10 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-white/20 bg-black/70 text-lg text-white transition hover:bg-black/85"
          type="button"
          onClick={onClose}
        >
          ×
        </button>
        <img alt={alt ?? ''} className="max-h-[90vh] max-w-[90vw] object-contain" src={src} />
      </div>
    </div>,
    document.body,
  );
}
