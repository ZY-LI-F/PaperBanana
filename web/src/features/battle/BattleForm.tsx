import { Button, Card, Empty, Field, HelperText, Label, RunStatusChip, Select, Tag, Textarea } from '../../components/ui';
import { cn, controlClass } from '../../components/ui/shared';
import type { RunStatus } from '../../lib/api';
import type { BattleFormValues, ModelOption } from './types';

const aspectRatioOptions = [
  { label: '16:9', value: '16:9' },
  { label: '4:3', value: '4:3' },
  { label: '1:1', value: '1:1' },
];

const expModeOptions = [
  { label: 'Demo Full', value: 'demo_full' },
  { label: 'Dev Full', value: 'dev_full' },
  { label: 'Dev Planner + Stylist', value: 'dev_planner_stylist' },
];

const retrievalOptions = [
  { label: 'Auto', value: 'auto' },
  { label: 'None', value: 'none' },
];

type BattleFormProps = {
  error: string | null;
  form: BattleFormValues;
  imageModelOptions: ModelOption[];
  isLoadingSettings: boolean;
  isSubmitting: boolean;
  mainModelOptions: ModelOption[];
  onFieldChange: (field: keyof BattleFormValues, value: string | number) => void;
  onSubmit: () => void;
  onToggleModel: (modelId: string) => void;
  parentRunId: string | null;
  parentStatus: RunStatus | null;
  submitDisabled: boolean;
};

function TextFields({
  caption,
  methodContent,
  onFieldChange,
}: {
  caption: string;
  methodContent: string;
  onFieldChange: BattleFormProps['onFieldChange'];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Field>
        <Label htmlFor="battle-caption" required>
          Caption
        </Label>
        <Textarea id="battle-caption" placeholder="Figure caption" value={caption} onChange={(event) => onFieldChange('caption', event.currentTarget.value)} />
      </Field>
      <Field>
        <Label htmlFor="battle-method" required>
          Method
        </Label>
        <Textarea id="battle-method" placeholder="Paste method section here" value={methodContent} onChange={(event) => onFieldChange('methodContent', event.currentTarget.value)} />
      </Field>
    </div>
  );
}

function ParameterFields({
  form,
  mainModelOptions,
  onFieldChange,
}: {
  form: BattleFormValues;
  mainModelOptions: ModelOption[];
  onFieldChange: BattleFormProps['onFieldChange'];
}) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-4">
        <Field>
          <Label htmlFor="battle-main-model">Main model</Label>
          <Select id="battle-main-model" options={mainModelOptions.map((option) => ({ label: option.label, value: option.id }))} value={form.mainModel} onChange={(event) => onFieldChange('mainModel', event.currentTarget.value)} />
        </Field>
        <Field>
          <Label htmlFor="battle-exp-mode">Exp mode</Label>
          <Select id="battle-exp-mode" options={expModeOptions} value={form.expMode} onChange={(event) => onFieldChange('expMode', event.currentTarget.value)} />
        </Field>
        <Field>
          <Label htmlFor="battle-retrieval">Retrieval</Label>
          <Select id="battle-retrieval" options={retrievalOptions} value={form.retrievalSetting} onChange={(event) => onFieldChange('retrievalSetting', event.currentTarget.value)} />
        </Field>
        <Field>
          <Label htmlFor="battle-aspect-ratio">Aspect ratio</Label>
          <Select id="battle-aspect-ratio" options={aspectRatioOptions} value={form.aspectRatio} onChange={(event) => onFieldChange('aspectRatio', event.currentTarget.value)} />
        </Field>
      </div>
      <Field className="max-w-xs">
        <Label htmlFor="battle-critic-rounds">Max critic rounds</Label>
        <input className={controlClass} id="battle-critic-rounds" max={6} min={0} step={1} type="number" value={form.maxCriticRounds} onChange={(event) => onFieldChange('maxCriticRounds', Number.parseInt(event.currentTarget.value || '0', 10))} />
      </Field>
    </>
  );
}

function ModelPicker({
  disabled,
  options,
  selected,
  onToggle,
}: {
  disabled: boolean;
  onToggle: (modelId: string) => void;
  options: ModelOption[];
  selected: string[];
}) {
  if (!options.length) {
    return <Empty description="`/api/providers` 还没有返回可用于 battle 的图像模型。" title="No image models" />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((option) => {
        const active = selected.includes(option.id);
        return (
          <label className={cn('flex items-start gap-3 rounded-md border px-4 py-3 transition', active ? 'border-border-strong bg-subtle' : 'border-border')} key={option.id}>
            <input checked={active} disabled={disabled} type="checkbox" onChange={() => onToggle(option.id)} />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-primary">{option.modelName}</span>
              <span className="block text-xs text-secondary">{option.providerName}</span>
              <span className="block text-2xs uppercase tracking-[var(--tracking-eyebrow)] text-muted">{option.id}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function SubmitRow({
  disabled,
  isSubmitting,
  parentRunId,
  parentStatus,
}: {
  disabled: boolean;
  isSubmitting: boolean;
  parentRunId: string | null;
  parentStatus: RunStatus | null;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Button disabled={disabled} type="submit">
        {isSubmitting ? 'Submitting...' : 'Start battle'}
      </Button>
      {parentRunId ? <Tag tone="warn">parent {parentRunId}</Tag> : null}
      {parentStatus ? <RunStatusChip status={parentStatus} /> : null}
    </div>
  );
}

export function BattleForm({
  error,
  form,
  imageModelOptions,
  isLoadingSettings,
  isSubmitting,
  mainModelOptions,
  onFieldChange,
  onSubmit,
  onToggleModel,
  parentRunId,
  parentStatus,
  submitDisabled,
}: BattleFormProps) {
  const disableSubmit = submitDisabled || isLoadingSettings || isSubmitting;

  return (
    <Card subtitle="Battle 会复用一次共享 planner/stylist 流程，然后并行 fan-out 到多个图像模型做最终可视化。" title="Battle">
      <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <TextFields caption={form.caption} methodContent={form.methodContent} onFieldChange={onFieldChange} />
        <ParameterFields form={form} mainModelOptions={mainModelOptions} onFieldChange={onFieldChange} />
        <SubmitRow disabled={disableSubmit} isSubmitting={isSubmitting} parentRunId={parentRunId} parentStatus={parentStatus} />
        <Field>
          <Label>Image-capable models</Label>
          <HelperText>勾选至少两个图像模型；battle 页会按所选顺序展示网格结果。</HelperText>
          <ModelPicker disabled={isSubmitting || isLoadingSettings} options={imageModelOptions} selected={form.imageModels} onToggle={onToggleModel} />
        </Field>
        {error ? <p className="m-0 text-sm text-danger">{error}</p> : null}
      </form>
    </Card>
  );
}
