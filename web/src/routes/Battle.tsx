import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Empty, StageTimeline } from '../components/ui';
import { BattleForm } from '../features/battle/BattleForm';
import { BattleGrid } from '../features/battle/BattleGrid';
import { useBattle } from '../features/battle/useBattle';
import { useSettingsStore } from '../features/battle/useSettingsStore';
import type { BattleFormValues, ModelOption } from '../features/battle/types';

const initialForm: BattleFormValues = {
  aspectRatio: '16:9',
  caption: '',
  expMode: 'demo_full',
  imageModels: [],
  mainModel: '',
  maxCriticRounds: 1,
  methodContent: '',
  retrievalSetting: 'auto',
};

function seedForm({
  current,
  defaults,
  imageModels,
  mainModels,
}: {
  current: BattleFormValues;
  defaults: { image_gen_model?: string; main_model?: string };
  imageModels: ModelOption[];
  mainModels: ModelOption[];
}) {
  const nextMainModel = current.mainModel || defaults.main_model || mainModels[0]?.id || '';
  if (current.imageModels.length) return { ...current, mainModel: nextMainModel };
  const seededModels = [defaults.image_gen_model, ...imageModels.map((option) => option.id)].filter(Boolean) as string[];
  const uniqueModels = Array.from(new Set(seededModels)).slice(0, 2);
  return { ...current, imageModels: uniqueModels, mainModel: nextMainModel };
}

function toggleSelection(selected: string[], modelId: string) {
  return selected.includes(modelId) ? selected.filter((item) => item !== modelId) : [...selected, modelId];
}

function buildLabelMap(options: ModelOption[]) {
  return Object.fromEntries(options.map((option) => [option.id, option.label]));
}

function resolveValidationError({
  mainModel,
  selectedModels,
  settingsError,
}: {
  mainModel: string;
  selectedModels: string[];
  settingsError: string | null;
}) {
  if (settingsError) return settingsError;
  if (!mainModel) return '需要先在 Settings 中配置一个 main model。';
  return selectedModels.length < 2 ? '至少选择两个 image-capable 模型才能发起 battle。' : null;
}

function updateFormField(setForm: Dispatch<SetStateAction<BattleFormValues>>, field: keyof BattleFormValues, value: string | number) {
  setForm((current) => ({ ...current, [field]: value }));
}

export default function BattleRoute() {
  const { defaults, error: settingsError, imageModelOptions, load, mainModelOptions, status } = useSettingsStore();
  const { cells, error: battleError, isSubmitting, parentRunId, parentStatus, stages, submit } = useBattle();
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (status === 'idle') {
      void load();
    }
  }, [load, status]);

  useEffect(() => {
    if (status !== 'ready') return;
    setForm((current) => seedForm({ current, defaults, imageModels: imageModelOptions, mainModels: mainModelOptions }));
  }, [defaults, imageModelOptions, mainModelOptions, status]);

  const labelMap = buildLabelMap(imageModelOptions);
  const validationError = resolveValidationError({
    mainModel: form.mainModel,
    selectedModels: form.imageModels,
    settingsError,
  });
  const formError = validationError ?? battleError;

  return (
    <div className="space-y-6">
      <BattleForm
        error={formError}
        form={form}
        imageModelOptions={imageModelOptions}
        isLoadingSettings={status === 'loading'}
        isSubmitting={isSubmitting}
        mainModelOptions={mainModelOptions}
        onFieldChange={(field, value) => updateFormField(setForm, field, value)}
        onSubmit={() => void submit({ ...form, modelLabels: labelMap })}
        onToggleModel={(modelId) => setForm((current) => ({ ...current, imageModels: toggleSelection(current.imageModels, modelId) }))}
        parentRunId={parentRunId}
        parentStatus={parentStatus}
        submitDisabled={Boolean(validationError)}
      />

      {stages.length ? (
        <StageTimeline stages={stages} />
      ) : (
        <Empty
          description="提交 battle 后，这里会显示共享 planner/stylist 的阶段状态；battle 子结果则展示在下方网格。"
          title="Shared timeline idle"
        />
      )}

      <BattleGrid items={cells} />
    </div>
  );
}
