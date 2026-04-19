import type { FormEvent } from 'react';
import {
  Button,
  Card,
  Combobox,
  ErrorText,
  Field,
  HelperText,
  Label,
  NumberField,
  Select,
  Tag,
  Textarea,
} from '../../components/ui';
import {
  ASPECT_RATIO_OPTIONS,
  EXAMPLE_CAPTION,
  EXAMPLE_KEY,
  EXAMPLE_METHOD,
  EXAMPLE_OPTIONS,
  FIGURE_LANGUAGE_OPTIONS,
  FIGURE_SIZE_OPTIONS,
  PIPELINE_DESCRIPTIONS,
  PIPELINE_OPTIONS,
  RETRIEVAL_OPTIONS,
} from './constants';
import type { GenerateFormErrors, GenerateFormState } from './types';

type GenerateFormProps = {
  errors: GenerateFormErrors;
  form: GenerateFormState;
  imageModelOptions: { hint?: string; label: string; value: string }[];
  isRunning: boolean;
  isSubmitting: boolean;
  mainModelOptions: { hint?: string; label: string; value: string }[];
  modelLoadError?: string | null;
  onChange: <K extends keyof GenerateFormState>(
    field: K,
    value: GenerateFormState[K],
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitError?: string | null;
};

export function GenerateForm({
  errors,
  form,
  imageModelOptions,
  isRunning,
  isSubmitting,
  mainModelOptions,
  modelLoadError,
  onChange,
  onSubmit,
  submitError,
}: GenerateFormProps) {
  const isBusy = isRunning || isSubmitting;

  return (
    <Card
      subtitle="Medical-tech tuned prompt intake for method content, caption, retrieval policy, and model selection."
      title="Generate candidates"
    >
      <form className="space-y-6" onSubmit={onSubmit}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
          <RunConfigSection
            errors={errors}
            form={form}
            imageModelOptions={imageModelOptions}
            isBusy={isBusy}
            mainModelOptions={mainModelOptions}
            modelLoadError={modelLoadError}
            onChange={onChange}
          />
          <PromptInputsSection
            errors={errors}
            form={form}
            isBusy={isBusy}
            isRunning={isRunning}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onChange={onChange}
          />
        </div>
      </form>
    </Card>
  );
}

function RunConfigSection({
  errors,
  form,
  imageModelOptions,
  isBusy,
  mainModelOptions,
  modelLoadError,
  onChange,
}: Omit<GenerateFormProps, 'isRunning' | 'isSubmitting' | 'onSubmit' | 'submitError'> & {
  isBusy: boolean;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-semibold text-primary">Run config</h3>
          <p className="m-0 text-xs text-secondary">
            Mirrors the legacy Gradio Generate tab parameters.
          </p>
        </div>
        <Tag tone="neutral">T07</Tag>
      </div>

      <Field>
        <Label htmlFor="expMode">Pipeline mode</Label>
        <Select
          disabled={isBusy}
          id="expMode"
          options={PIPELINE_OPTIONS}
          value={form.expMode}
          onChange={(event) => onChange('expMode', event.currentTarget.value)}
        />
        <HelperText>{PIPELINE_DESCRIPTIONS[form.expMode]}</HelperText>
      </Field>

      <ConfigSelectRow
        form={form}
        isBusy={isBusy}
        onChange={onChange}
      />
      <ConfigNumberRow
        errors={errors}
        form={form}
        isBusy={isBusy}
        onChange={onChange}
      />
      <ConfigFigureRow form={form} isBusy={isBusy} onChange={onChange} />
      <ModelInputs
        errors={errors}
        form={form}
        imageModelOptions={imageModelOptions}
        isBusy={isBusy}
        mainModelOptions={mainModelOptions}
        modelLoadError={modelLoadError}
        onChange={onChange}
      />
    </section>
  );
}

function PromptInputsSection({
  errors,
  form,
  isBusy,
  isRunning,
  isSubmitting,
  submitError,
  onChange,
}: Pick<
  GenerateFormProps,
  'errors' | 'form' | 'isRunning' | 'isSubmitting' | 'submitError' | 'onChange'
> & {
  isBusy: boolean;
}) {
  return (
    <section className="space-y-4">
      <ExampleRow form={form} isBusy={isBusy} onChange={onChange} />
      <MethodField errors={errors} form={form} isBusy={isBusy} onChange={onChange} />
      <CaptionField errors={errors} form={form} isBusy={isBusy} onChange={onChange} />

      {submitError ? <ErrorText>{submitError}</ErrorText> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isBusy} size="lg" type="submit">
          {isSubmitting ? 'Submitting...' : isRunning ? 'Run in progress' : 'Generate'}
        </Button>
        <HelperText>
          Submits to <code>/api/runs</code> and streams live stage updates.
        </HelperText>
      </div>
    </section>
  );
}

function ConfigSelectRow({
  form,
  isBusy,
  onChange,
}: {
  form: GenerateFormState;
  isBusy: boolean;
  onChange: GenerateFormProps['onChange'];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <Label htmlFor="retrievalSetting">Retrieval setting</Label>
        <Select
          disabled={isBusy}
          id="retrievalSetting"
          options={RETRIEVAL_OPTIONS}
          value={form.retrievalSetting}
          onChange={(event) => onChange('retrievalSetting', event.currentTarget.value)}
        />
      </Field>

      <Field>
        <Label htmlFor="aspectRatio">Aspect ratio</Label>
        <Select
          disabled={isBusy}
          id="aspectRatio"
          options={ASPECT_RATIO_OPTIONS}
          value={form.aspectRatio}
          onChange={(event) => onChange('aspectRatio', event.currentTarget.value)}
        />
      </Field>
    </div>
  );
}

function ConfigNumberRow({
  errors,
  form,
  isBusy,
  onChange,
}: {
  errors: GenerateFormErrors;
  form: GenerateFormState;
  isBusy: boolean;
  onChange: GenerateFormProps['onChange'];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <Label htmlFor="numCandidates">Number of candidates</Label>
        <NumberField
          disabled={isBusy}
          id="numCandidates"
          max={20}
          min={1}
          step={1}
          value={form.numCandidates}
          onChangeValue={(value) => onChange('numCandidates', value)}
        />
        {errors.numCandidates ? <ErrorText>{errors.numCandidates}</ErrorText> : null}
      </Field>

      <Field>
        <Label htmlFor="maxCriticRounds">Max critic rounds</Label>
        <NumberField
          disabled={isBusy}
          id="maxCriticRounds"
          max={5}
          min={1}
          step={1}
          value={form.maxCriticRounds}
          onChangeValue={(value) => onChange('maxCriticRounds', value)}
        />
        {errors.maxCriticRounds ? (
          <ErrorText>{errors.maxCriticRounds}</ErrorText>
        ) : null}
      </Field>
    </div>
  );
}

function ConfigFigureRow({
  form,
  isBusy,
  onChange,
}: {
  form: GenerateFormState;
  isBusy: boolean;
  onChange: GenerateFormProps['onChange'];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <Label htmlFor="figureSize">Figure size</Label>
        <Select
          disabled={isBusy}
          id="figureSize"
          options={FIGURE_SIZE_OPTIONS}
          value={form.figureSize}
          onChange={(event) => onChange('figureSize', event.currentTarget.value)}
        />
      </Field>

      <Field>
        <Label htmlFor="figureLanguage">Figure language</Label>
        <Select
          disabled={isBusy}
          id="figureLanguage"
          options={FIGURE_LANGUAGE_OPTIONS}
          value={form.figureLanguage}
          onChange={(event) => onChange('figureLanguage', event.currentTarget.value)}
        />
      </Field>
    </div>
  );
}

function ModelInputs({
  errors,
  form,
  imageModelOptions,
  isBusy,
  mainModelOptions,
  modelLoadError,
  onChange,
}: Omit<GenerateFormProps, 'isRunning' | 'isSubmitting' | 'onSubmit' | 'submitError'> & {
  isBusy: boolean;
}) {
  return (
    <>
      <Field>
        <Label htmlFor="mainModel" required>
          Main model
        </Label>
        <Combobox
          disabled={isBusy}
          id="mainModel"
          options={mainModelOptions}
          placeholder="provider::reasoning-model"
          value={form.mainModel}
          onChange={(event) => onChange('mainModel', event.currentTarget.value)}
        />
        {errors.mainModel ? <ErrorText>{errors.mainModel}</ErrorText> : null}
      </Field>

      <Field>
        <Label htmlFor="imageModel" required>
          Image model
        </Label>
        <Combobox
          disabled={isBusy}
          id="imageModel"
          options={imageModelOptions}
          placeholder="provider::image-model"
          value={form.imageModel}
          onChange={(event) => onChange('imageModel', event.currentTarget.value)}
        />
        {errors.imageModel ? <ErrorText>{errors.imageModel}</ErrorText> : null}
        {modelLoadError ? <ErrorText>{modelLoadError}</ErrorText> : null}
      </Field>
    </>
  );
}

function ExampleRow({
  form,
  isBusy,
  onChange,
}: {
  form: GenerateFormState;
  isBusy: boolean;
  onChange: GenerateFormProps['onChange'];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field>
        <Label htmlFor="methodExample">Load example (method)</Label>
        <Select
          disabled={isBusy}
          id="methodExample"
          options={EXAMPLE_OPTIONS}
          value={form.methodContent === EXAMPLE_METHOD ? EXAMPLE_KEY : 'none'}
          onChange={(event) =>
            onChange(
              'methodContent',
              event.currentTarget.value === EXAMPLE_KEY ? EXAMPLE_METHOD : '',
            )
          }
        />
      </Field>

      <Field>
        <Label htmlFor="captionExample">Load example (caption)</Label>
        <Select
          disabled={isBusy}
          id="captionExample"
          options={EXAMPLE_OPTIONS}
          value={form.caption === EXAMPLE_CAPTION ? EXAMPLE_KEY : 'none'}
          onChange={(event) =>
            onChange(
              'caption',
              event.currentTarget.value === EXAMPLE_KEY ? EXAMPLE_CAPTION : '',
            )
          }
        />
      </Field>
    </div>
  );
}

function MethodField({
  errors,
  form,
  isBusy,
  onChange,
}: {
  errors: GenerateFormErrors;
  form: GenerateFormState;
  isBusy: boolean;
  onChange: GenerateFormProps['onChange'];
}) {
  return (
    <Field>
      <Label htmlFor="methodContent" required>
        Method content
      </Label>
      <Textarea
        disabled={isBusy}
        id="methodContent"
        rows={18}
        value={form.methodContent}
        onChange={(event) => onChange('methodContent', event.currentTarget.value)}
      />
      {errors.methodContent ? (
        <ErrorText>{errors.methodContent}</ErrorText>
      ) : (
        <HelperText>
          Paste the method section or load the PaperBanana example.
        </HelperText>
      )}
    </Field>
  );
}

function CaptionField({
  errors,
  form,
  isBusy,
  onChange,
}: {
  errors: GenerateFormErrors;
  form: GenerateFormState;
  isBusy: boolean;
  onChange: GenerateFormProps['onChange'];
}) {
  return (
    <Field>
      <Label htmlFor="caption" required>
        Figure caption
      </Label>
      <Textarea
        disabled={isBusy}
        id="caption"
        rows={8}
        value={form.caption}
        onChange={(event) => onChange('caption', event.currentTarget.value)}
      />
      {errors.caption ? <ErrorText>{errors.caption}</ErrorText> : null}
    </Field>
  );
}
