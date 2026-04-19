import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { Button, Card, Tabs, type TabItem } from '../../components/ui';
import { appendEmptyModel, buildProvidersPayload, createEmptyProvider, createProviderDrafts } from './drafts';
import { DefaultsForm } from './DefaultsForm';
import { ModelsTable } from './ModelsTable';
import { ProvidersTable } from './ProvidersTable';
import { YamlEditor } from './YamlEditor';
import type { ProviderDraft, SettingsDefaults, SettingsModelOption } from './types';
import { useSettingsStore } from '../../stores/useSettingsStore';

type NoticeMap = Record<'defaults' | 'providers' | 'yaml', string>;
type SectionKey = keyof NoticeMap;

const emptyNotices: NoticeMap = { defaults: '', providers: '', yaml: '' };

export function SettingsScreen() {
  const defaults = useSettingsStore((state) => state.defaults);
  const error = useSettingsStore((state) => state.error);
  const hasAttemptedLoad = useSettingsStore((state) => state.hasAttemptedLoad);
  const hydrated = useSettingsStore((state) => state.hydrated);
  const isLoading = useSettingsStore((state) => state.isLoading);
  const load = useSettingsStore((state) => state.load);
  const models = useSettingsStore((state) => state.models);
  const providerDefaults = useSettingsStore((state) => state.providerDefaults);
  const providers = useSettingsStore((state) => state.providers);
  const saveDefaults = useSettingsStore((state) => state.saveDefaults);
  const saveProviders = useSettingsStore((state) => state.saveProviders);
  const saveYaml = useSettingsStore((state) => state.saveYaml);
  const yaml = useSettingsStore((state) => state.yaml);
  const [defaultsDraft, setDefaultsDraft] = useState<SettingsDefaults>({});
  const [errors, setErrors] = useState<NoticeMap>(emptyNotices);
  const [notices, setNotices] = useState<NoticeMap>(emptyNotices);
  const [providerDrafts, setProviderDrafts] = useState<ProviderDraft[]>([]);
  const [saving, setSaving] = useState<SectionKey | null>(null);
  const [yamlDraft, setYamlDraft] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setProviderDrafts(createProviderDrafts(providers)), [providers]);
  useEffect(() => setDefaultsDraft(defaults), [defaults]);
  useEffect(() => setYamlDraft(yaml), [yaml]);

  const showTabs = hydrated;

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="m-0 text-2xs font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-muted">Registry</p>
        <h1 className="m-0 text-2xl font-semibold text-primary">Settings</h1>
        <p className="m-0 text-sm text-secondary">
          Move provider credentials, model lists, default selectors, and advanced YAML editing out of the Generate flow.
        </p>
      </header>
      {!hydrated && isLoading ? <LoadingState /> : null}
      {!hydrated && hasAttemptedLoad && error ? (
        <LoadErrorState
          error={error}
          onRetry={() => void load(true)}
          retrying={isLoading}
        />
      ) : null}
      {showTabs ? (
        <Tabs items={buildTabs({
          defaultsDraft,
          errors,
          models,
          notices,
          onAddModel: (providerIndex) => patchProvider(providerIndex, (provider) => appendEmptyModel(provider), setProviderDrafts),
          onAddProvider: () => setProviderDrafts((current) => [...current, createEmptyProvider()]),
          onChangeDefault: (key, value) => setDefaultsDraft((current) => ({ ...current, [key]: value })),
          onChangeYaml: setYamlDraft,
          onUpdateProvider: (index, provider) => replaceProvider(index, provider, setProviderDrafts),
          providerDrafts,
          onRemoveModel: (providerIndex, modelIndex) => removeModel(providerIndex, modelIndex, setProviderDrafts),
          onRemoveProvider: (providerIndex) => setProviderDrafts((current) => current.filter((_, index) => index !== providerIndex)),
          onResetYaml: () => setYamlDraft(yaml),
          onSaveDefaults: () => void runSave('defaults', () => saveDefaults(defaultsDraft), setErrors, setNotices, setSaving, 'Defaults saved.'),
          onSaveProviders: () => void runSave('providers', () => saveProviders(buildProvidersPayload(providerDrafts, providerDefaults)), setErrors, setNotices, setSaving, 'Providers saved and registry store refreshed.'),
          onSaveYaml: () => void runSave('yaml', () => saveYaml(yamlDraft), setErrors, setNotices, setSaving, 'YAML saved and registry store refreshed.'),
          onUpdateModel: (providerIndex, modelIndex, key, value) => updateModel(providerIndex, modelIndex, key, value, setProviderDrafts),
          saving,
          yamlDraft,
        })} />
      ) : null}
    </section>
  );
}

type BuildTabsArgs = {
  defaultsDraft: SettingsDefaults;
  errors: NoticeMap;
  models: SettingsModelOption[];
  notices: NoticeMap;
  onAddModel: (providerIndex: number) => void;
  onAddProvider: () => void;
  onChangeDefault: (key: string, value: string) => void;
  onChangeYaml: (value: string) => void;
  onUpdateProvider: (index: number, provider: ProviderDraft) => void;
  providerDrafts: ProviderDraft[];
  onRemoveModel: (providerIndex: number, modelIndex: number) => void;
  onRemoveProvider: (providerIndex: number) => void;
  onResetYaml: () => void;
  onSaveDefaults: () => void;
  onSaveProviders: () => void;
  onSaveYaml: () => void;
  onUpdateModel: (
    providerIndex: number,
    modelIndex: number,
    key: 'capability' | 'invoke' | 'name',
    value: string,
  ) => void;
  saving: SectionKey | null;
  yamlDraft: string;
};

function buildTabs({
  defaultsDraft,
  errors,
  models,
  notices,
  onAddModel,
  onAddProvider,
  onChangeDefault,
  onChangeYaml,
  onUpdateProvider,
  providerDrafts,
  onRemoveModel,
  onRemoveProvider,
  onResetYaml,
  onSaveDefaults,
  onSaveProviders,
  onSaveYaml,
  onUpdateModel,
  saving,
  yamlDraft,
}: BuildTabsArgs): TabItem[] {
  return [
    {
      content: (
        <div className="space-y-6">
          <ProvidersTable
            error={errors.providers}
            message={notices.providers}
            onAddProvider={onAddProvider}
            onRemoveProvider={onRemoveProvider}
            onSave={onSaveProviders}
            onUpdateProvider={onUpdateProvider}
            providers={providerDrafts}
            saving={saving === 'providers'}
          />
          <ModelsTable
            onAddModel={onAddModel}
            onRemoveModel={onRemoveModel}
            onUpdateModel={onUpdateModel}
            providers={providerDrafts}
          />
        </div>
      ),
      key: 'providers',
      label: 'Providers & Models',
    },
    {
      content: (
        <DefaultsForm
          defaults={defaultsDraft}
          error={errors.defaults}
          message={notices.defaults}
          models={models}
          onChange={onChangeDefault}
          onSave={onSaveDefaults}
          saving={saving === 'defaults'}
        />
      ),
      key: 'defaults',
      label: 'Defaults',
    },
    {
      content: (
        <YamlEditor
          error={errors.yaml}
          message={notices.yaml}
          onChange={onChangeYaml}
          onReset={onResetYaml}
          onSave={onSaveYaml}
          saving={saving === 'yaml'}
          value={yamlDraft}
        />
      ),
      key: 'yaml',
      label: 'Advanced YAML',
    },
  ];
}

async function runSave(
  section: SectionKey,
  action: () => Promise<void>,
  setErrors: Dispatch<SetStateAction<NoticeMap>>,
  setNotices: Dispatch<SetStateAction<NoticeMap>>,
  setSaving: Dispatch<SetStateAction<SectionKey | null>>,
  successMessage: string,
) {
  setSaving(section);
  setErrors((current) => ({ ...current, [section]: '' }));
  setNotices((current) => ({ ...current, [section]: '' }));
  try {
    await action();
    setNotices((current) => ({ ...current, [section]: successMessage }));
  } catch (error) {
    setErrors((current) => ({ ...current, [section]: readError(error) }));
  } finally {
    setSaving(null);
  }
}

function patchProvider(
  providerIndex: number,
  update: (provider: ProviderDraft) => ProviderDraft,
  setProviderDrafts: Dispatch<SetStateAction<ProviderDraft[]>>,
) {
  setProviderDrafts((current) => current.map((provider, index) => (index === providerIndex ? update(provider) : provider)));
}

function replaceProvider(
  providerIndex: number,
  provider: ProviderDraft,
  setProviderDrafts: Dispatch<SetStateAction<ProviderDraft[]>>,
) {
  patchProvider(providerIndex, () => provider, setProviderDrafts);
}

function removeModel(
  providerIndex: number,
  modelIndex: number,
  setProviderDrafts: Dispatch<SetStateAction<ProviderDraft[]>>,
) {
  patchProvider(
    providerIndex,
    (provider) => ({ ...provider, models: provider.models.filter((_, index) => index !== modelIndex) }),
    setProviderDrafts,
  );
}

function updateModel(
  providerIndex: number,
  modelIndex: number,
  key: 'capability' | 'invoke' | 'name',
  value: string,
  setProviderDrafts: Dispatch<SetStateAction<ProviderDraft[]>>,
) {
  patchProvider(
    providerIndex,
    (provider) => ({
      ...provider,
      models: provider.models.map((model, index) => {
        if (index !== modelIndex) return model;
        return { ...model, [key]: value };
      }),
    }),
    setProviderDrafts,
  );
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown settings error';
}

function LoadingState() {
  return (
    <Card subtitle="Fetching providers, default selections, and the redacted YAML snapshot." title="Loading settings">
      <p className="m-0 text-sm text-secondary">The page waits for the shared settings store before rendering editors.</p>
    </Card>
  );
}

type LoadErrorStateProps = {
  error: string;
  onRetry: () => void;
  retrying: boolean;
};

function LoadErrorState({ error, onRetry, retrying }: LoadErrorStateProps) {
  return (
    <Card
      actions={
        <Button size="sm" variant="secondary" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      }
      subtitle="Automatic retries stop after the first failed load so the error remains stable."
      title="Settings unavailable"
    >
      <p className="m-0 text-sm text-danger">{error}</p>
    </Card>
  );
}
