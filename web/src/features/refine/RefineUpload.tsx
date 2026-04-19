import {
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from 'react';
import { Button, ErrorText } from '../../components/ui';
import { cn } from '../../components/ui/shared';
import { IMAGE_INPUT_ACCEPT } from './constants';

type RefineUploadProps = {
  beforeImageUrl: string | null;
  error?: string;
  inputId: string;
  inputRef: RefObject<HTMLInputElement>;
  isDragging: boolean;
  onClearFile: () => void;
  onFileChange: (file: File | null) => void;
  onOpenPicker: () => void;
  onSetDragging: (value: boolean) => void;
};

export function RefineUpload({
  beforeImageUrl,
  error,
  inputId,
  inputRef,
  isDragging,
  onClearFile,
  onFileChange,
  onOpenPicker,
  onSetDragging,
}: RefineUploadProps) {
  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    onFileChange(event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = '';
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    onSetDragging(false);
    onFileChange(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-semibold text-primary">Upload</h3>
          <p className="m-0 text-xs text-secondary">
            Accepts PNG, JPEG, or WEBP. The original asset stays visible for side-by-side review.
          </p>
        </div>
        {beforeImageUrl ? (
          <Button size="sm" variant="ghost" onClick={onClearFile}>
            Clear
          </Button>
        ) : null}
      </div>

      <input
        accept={IMAGE_INPUT_ACCEPT}
        className="sr-only"
        id={inputId}
        ref={inputRef}
        type="file"
        onChange={handleInputChange}
      />

      <label
        className={cn(
          'flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition',
          isDragging
            ? 'border-border-strong bg-surface'
            : 'border-border bg-canvas hover:border-border-strong hover:bg-surface',
        )}
        htmlFor={inputId}
        onDragEnter={(event) => handleDragState(event, true, onSetDragging)}
        onDragLeave={(event) => handleDragState(event, false, onSetDragging)}
        onDragOver={preventDefault}
        onDrop={handleDrop}
      >
        {beforeImageUrl ? (
          <img
            alt="Uploaded source"
            className="max-h-72 w-full rounded-md border border-border object-contain"
            src={beforeImageUrl}
          />
        ) : (
          <>
            <p className="m-0 text-sm font-semibold text-primary">Drop an existing diagram here</p>
            <p className="m-0 mt-2 max-w-sm text-sm text-secondary">
              Or browse a local file to send through the legacy refine pipeline.
            </p>
            <Button className="mt-4" size="sm" variant="secondary" onClick={onOpenPicker}>
              Browse files
            </Button>
          </>
        )}
      </label>

      {error ? <ErrorText>{error}</ErrorText> : null}
    </section>
  );
}

function handleDragState(
  event: DragEvent<HTMLElement>,
  nextValue: boolean,
  onSetDragging: (value: boolean) => void,
) {
  event.preventDefault();
  onSetDragging(nextValue);
}

function preventDefault(event: DragEvent<HTMLElement>) {
  event.preventDefault();
}
