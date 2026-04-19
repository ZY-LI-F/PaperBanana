import {
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  Button,
  Card,
  Combobox,
  ErrorText,
  Field,
  HelperText,
  Label,
  Select,
} from '../../components/ui';
import type { Option } from '../../components/ui/shared';
import {
  aspectRatioOptions,
  resolutionOptions,
} from './constants';
import { RefinePreview, RefineStatus } from './RefinePreview';
import { RefineUpload } from './RefineUpload';
import type { RefineFormErrors, RefineFormValues } from './types';

type RefineFormProps = {
  beforeImageUrl: string | null;
  downloadName: string | null;
  errors: RefineFormErrors;
  form: RefineFormValues;
  imageModelOptions: Option[];
  isLoadingSettings: boolean;
  isSubmitting: boolean;
  resultImageUrl: string | null;
  resultRunId: string | null;
  settingsError: string | null;
  statusMessage: string | null;
  submitError: string | null;
  onClearFile: () => void;
  onDownload: () => void;
  onFieldChange: <K extends keyof RefineFormValues>(
    field: K,
    value: RefineFormValues[K],
  ) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function RefineForm({
  beforeImageUrl,
  downloadName,
  errors,
  form,
  imageModelOptions,
  isLoadingSettings,
  isSubmitting,
  resultImageUrl,
  resultRunId,
  settingsError,
  statusMessage,
  submitError,
  onClearFile,
  onDownload,
  onFieldChange,
  onFileChange,
  onSubmit,
}: RefineFormProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const submitDisabled = isSubmitting || isLoadingSettings;

  return (
    <Card
      subtitle="Parity with the legacy Gradio Refine tab: drag in a diagram, add edit instructions, submit to /api/refine, then download the returned PNG bytes."
      title="Single-image refinement"
    >
      <form className="space-y-6" onSubmit={onSubmit}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <RefineUpload
            beforeImageUrl={beforeImageUrl}
            error={errors.file}
            inputId={inputId}
            inputRef={inputRef}
            isDragging={isDragging}
            onClearFile={onClearFile}
            onFileChange={onFileChange}
            onOpenPicker={() => inputRef.current?.click()}
            onSetDragging={setIsDragging}
          />
          <ConfigSection
            error={errors}
            form={form}
            imageModelOptions={imageModelOptions}
            isLoadingSettings={isLoadingSettings}
            isSubmitting={isSubmitting}
            settingsError={settingsError}
            submitDisabled={submitDisabled}
            onFieldChange={onFieldChange}
          />
        </div>

        {submitError ? <ErrorText>{submitError}</ErrorText> : null}
        {statusMessage ? <RefineStatus runId={resultRunId} statusMessage={statusMessage} /> : null}
        <RefinePreview
          downloadName={downloadName}
          imageUrl={resultImageUrl}
          onDownload={onDownload}
          sourceImageUrl={beforeImageUrl}
        />
      </form>
    </Card>
  );
}

function ConfigSection({
  error,
  form,
  imageModelOptions,
  isLoadingSettings,
  isSubmitting,
  settingsError,
  submitDisabled,
  onFieldChange,
}: {
  error: RefineFormErrors;
  form: RefineFormValues;
  imageModelOptions: Option[];
  isLoadingSettings: boolean;
  isSubmitting: boolean;
  settingsError: string | null;
  submitDisabled: boolean;
  onFieldChange: <K extends keyof RefineFormValues>(
    field: K,
    value: RefineFormValues[K],
  ) => void;
}) {
  return (
    <section className="space-y-4">
      <Field>
        <Label htmlFor="refinePrompt" required>
          Edit instructions
        </Label>
        <textarea
          className="min-h-40 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm text-primary shadow-card transition placeholder:text-muted focus:border-border-strong focus:outline-none"
          id="refinePrompt"
          placeholder="Keep the structure, tighten spacing, and export a cleaner publication-ready version."
          value={form.prompt}
          onChange={(event) => onFieldChange('prompt', event.currentTarget.value)}
        />
        {error.prompt ? (
          <ErrorText>{error.prompt}</ErrorText>
        ) : (
          <HelperText>Matches the legacy edit prompt field sent to the backend.</HelperText>
        )}
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <Label htmlFor="refineResolution">Resolution</Label>
          <Select
            id="refineResolution"
            options={resolutionOptions}
            value={form.resolution}
            onChange={(event) => onFieldChange('resolution', event.currentTarget.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="refineAspectRatio">Aspect ratio</Label>
          <Select
            id="refineAspectRatio"
            options={aspectRatioOptions}
            value={form.aspectRatio}
            onChange={(event) => onFieldChange('aspectRatio', event.currentTarget.value)}
          />
        </Field>
      </div>

      <Field>
        <Label htmlFor="refineImageModel" required>
          Image model
        </Label>
        <Combobox
          disabled={isLoadingSettings}
          id="refineImageModel"
          options={imageModelOptions}
          placeholder={
            isLoadingSettings ? 'Loading image models...' : 'provider::image-model'
          }
          value={form.imageModel}
          onChange={(event) => onFieldChange('imageModel', event.currentTarget.value)}
        />
        {error.imageModel ? <ErrorText>{error.imageModel}</ErrorText> : null}
        {settingsError ? <ErrorText>{settingsError}</ErrorText> : null}
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={submitDisabled} size="lg" type="submit">
          {isSubmitting ? 'Refining...' : 'Refine image'}
        </Button>
        <HelperText>
          Submits the selected file to <code>/api/refine</code> and keeps the returned PNG bytes untouched for download.
        </HelperText>
      </div>
    </section>
  );
}
