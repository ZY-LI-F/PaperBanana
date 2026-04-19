import { useEffect, useState, type FormEvent } from 'react';
import { Tag } from '../components/ui';
import { RefineForm } from '../features/refine/RefineForm';
import type { RefineFormErrors, RefineFormValues, RefineResult } from '../features/refine/types';
import {
  buildImageModelOptions,
  createInitialForm,
  createRefineResult,
  downloadBlob,
  fileToBase64,
  requestRefine,
  validateRefineForm,
} from '../features/refine/utils';
import { useSettingsStore } from '../stores/useSettingsStore';

export default function RefineRoute() {
  const defaults = useSettingsStore((state) => state.defaults);
  const load = useSettingsStore((state) => state.load);
  const models = useSettingsStore((state) => state.models);
  const settingsError = useSettingsStore((state) => state.error);
  const isLoadingSettings = useSettingsStore((state) => state.isLoading);
  const [form, setForm] = useState<RefineFormValues>(() => createInitialForm());
  const [errors, setErrors] = useState<RefineFormErrors>({});
  const [result, setResult] = useState<RefineResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const imageModelOptions = buildImageModelOptions(models);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setForm((current) => {
      if (current.imageModel) return current;
      return {
        ...current,
        imageModel: defaults.image_gen_model || imageModelOptions[0]?.value || '',
      };
    });
  }, [defaults.image_gen_model, imageModelOptions]);

  useEffect(() => {
    if (!selectedFile) {
      setSourcePreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(selectedFile);
    setSourcePreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.previewUrl);
    };
  }, [result]);

  function updateField<K extends keyof RefineFormValues>(
    field: K,
    value: RefineFormValues[K],
  ) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setForm((current) => ({ ...current, [field]: value }));
  }

  function clearResult() {
    setStatusMessage(null);
    setSubmitError(null);
    setResult((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }

  function handleFileChange(file: File | null) {
    setErrors((current) => ({ ...current, file: undefined }));
    setSelectedFile(file);
    clearResult();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateRefineForm(form, selectedFile, imageModelOptions.length > 0);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !selectedFile) return;

    setIsSubmitting(true);
    clearResult();
    try {
      const imageBase64 = await fileToBase64(selectedFile);
      const response = await requestRefine({
        aspectRatio: form.aspectRatio,
        editPrompt: form.prompt.trim(),
        imageBase64,
        imageModel: form.imageModel,
        imageSize: form.resolution,
      });
      setResult((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return createRefineResult(response);
      });
      setStatusMessage(`Refine completed via /api/refine. Run ${response.runId} is stored in History.`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Refine request failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    downloadBlob(result.blob, result.downloadName);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface px-6 py-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Tag tone="ok">Refine</Tag>
            <div>
              <h1 className="m-0 text-2xl font-semibold text-primary">Diagram cleanup + upscale</h1>
              <p className="m-0 text-sm text-secondary">
                Upload one image, describe the edit, send it through the backend refine router, and download the exact PNG returned by the API.
              </p>
            </div>
          </div>
        </div>
      </section>

      <RefineForm
        beforeImageUrl={sourcePreviewUrl}
        downloadName={result?.downloadName ?? null}
        errors={errors}
        form={form}
        imageModelOptions={imageModelOptions}
        isLoadingSettings={isLoadingSettings}
        isSubmitting={isSubmitting}
        resultImageUrl={result?.previewUrl ?? null}
        resultRunId={result?.runId ?? null}
        settingsError={settingsError}
        statusMessage={statusMessage}
        submitError={submitError}
        onClearFile={() => {
          setSelectedFile(null);
          clearResult();
        }}
        onDownload={handleDownload}
        onFieldChange={updateField}
        onFileChange={handleFileChange}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
