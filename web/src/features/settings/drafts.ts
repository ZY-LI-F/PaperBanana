import {
  EXP_MODE_KEY,
  IMAGE_CAPABILITY,
  IMAGE_MODEL_KEY,
  MAIN_MODEL_KEY,
  type ProviderDraft,
  type ProvidersSavePayload,
  type SettingsDefaults,
  type SettingsModel,
  type SettingsModelOption,
  type SettingsProvider,
} from './types';

const EMPTY_FIELD = '';
const NEW_PROVIDER_TYPE = 'openai';
const MAIN_MODEL_NAME_KEY = 'main_model_name';
const IMAGE_MODEL_NAME_KEY = 'image_gen_model_name';
const CHAT_MODEL_DEFAULT_KEYS = new Set([
  MAIN_MODEL_KEY,
  MAIN_MODEL_NAME_KEY,
]);
const IMAGE_MODEL_DEFAULT_KEYS = new Set([
  IMAGE_MODEL_KEY,
  IMAGE_MODEL_NAME_KEY,
]);
const MODEL_DEFAULT_KEYS = new Set([
  ...CHAT_MODEL_DEFAULT_KEYS,
  ...IMAGE_MODEL_DEFAULT_KEYS,
]);

function createEmptyModel(): SettingsModel {
  return {
    capability: 'chat',
    capabilities: ['chat'],
    id: EMPTY_FIELD,
    invoke: EMPTY_FIELD,
    kind: 'text',
    name: EMPTY_FIELD,
  };
}

export function createEmptyProvider(): ProviderDraft {
  return {
    apiKey: EMPTY_FIELD,
    apiKeyMasked: EMPTY_FIELD,
    baseUrl: EMPTY_FIELD,
    id: EMPTY_FIELD,
    models: [],
    name: EMPTY_FIELD,
    type: NEW_PROVIDER_TYPE,
  };
}

export function appendEmptyModel(provider: ProviderDraft): ProviderDraft {
  return { ...provider, models: [...provider.models, createEmptyModel()] };
}

export function createProviderDrafts(providers: SettingsProvider[]): ProviderDraft[] {
  return providers.map((provider) => ({
    ...provider,
    apiKey: EMPTY_FIELD,
    models: provider.models.map((model) => ({ ...model })),
  }));
}

export function normalizeDefaults(defaults: SettingsDefaults): SettingsDefaults {
  return Object.fromEntries(
    Object.entries(defaults).filter(([, value]) => value.trim()),
  );
}

export function buildProvidersPayload(
  providers: ProviderDraft[],
  defaults: SettingsDefaults,
): ProvidersSavePayload {
  validateProviders(providers);
  const nextProviders = providers
    .filter((provider) => provider.id.trim())
    .map((provider) => ({
      api_key: provider.apiKey.trim() || provider.apiKeyMasked,
      api_key_masked: provider.apiKeyMasked,
      base_url: provider.baseUrl.trim(),
      id: provider.id.trim(),
      models: provider.models
        .filter((model) => model.name.trim())
        .map((model) => ({
          capability: model.capability.trim() || 'chat',
          invoke: model.invoke.trim(),
          name: model.name.trim(),
        })),
      type: provider.type.trim() || NEW_PROVIDER_TYPE,
    }));
  return {
    defaults: alignDefaultsWithProviders(defaults, nextProviders),
    providers: nextProviders,
  };
}

type ProviderWithModels = {
  id: string;
  models: Array<{
    capabilities?: string[];
    capability?: string;
    id?: string;
    name: string;
  }>;
};

export function alignDefaultsWithProviders<T extends ProviderWithModels>(
  defaults: SettingsDefaults,
  providers: T[],
): SettingsDefaults {
  const normalizedDefaults = normalizeDefaults(defaults);
  const chatCatalog = createModelCatalog(providers, 'chat');
  const imageCatalog = createModelCatalog(providers, IMAGE_CAPABILITY);

  return Object.fromEntries(Object.entries(normalizedDefaults).flatMap(([key, value]) => {
    if (key === MAIN_MODEL_KEY) return normalizeCanonicalDefault(key, value, chatCatalog);
    if (key === IMAGE_MODEL_KEY) return normalizeCanonicalDefault(key, value, imageCatalog);
    if (key === MAIN_MODEL_NAME_KEY) return normalizeLegacyDefault(key, value, chatCatalog);
    if (key === IMAGE_MODEL_NAME_KEY) return normalizeLegacyDefault(key, value, imageCatalog);
    return [[key, value]];
  }));
}

type ModelCatalog = {
  values: Map<string, string | null>;
};

function createModelCatalog<T extends ProviderWithModels>(
  providers: T[],
  capability: string,
) {
  const values = new Map<string, string | null>();

  providers.forEach((provider) => {
    const providerId = provider.id.trim();
    if (!providerId) return;

    provider.models.forEach((model) => {
      const modelName = model.name.trim();
      if (!modelName || !supportsCapability(model, capability)) return;

      const canonicalId = model.id?.trim() || `${providerId}::${modelName}`;
      registerExactModelValue(values, canonicalId);
      registerExactModelValue(values, `${providerId}::${modelName}`, canonicalId);
      registerNamedModelValue(values, modelName, canonicalId);
    });
  });

  return { values };
}

function normalizeCanonicalDefault(
  key: string,
  value: string,
  catalog: ModelCatalog,
) {
  const resolvedValue = resolveModelValue(value, catalog);
  if (resolvedValue === undefined) return [];
  return [[key, resolvedValue ?? value]];
}

function normalizeLegacyDefault(
  key: string,
  value: string,
  catalog: ModelCatalog,
) {
  return resolveModelValue(value, catalog) === undefined ? [] : [[key, value]];
}

function resolveModelValue(
  value: string,
  catalog: ModelCatalog,
) {
  if (!catalog.values.has(value)) return undefined;
  return catalog.values.get(value) ?? null;
}

function registerExactModelValue(
  values: ModelCatalog['values'],
  alias: string,
  canonicalId?: string,
) {
  values.set(alias, canonicalId ?? alias);
}

function registerNamedModelValue(
  values: ModelCatalog['values'],
  modelName: string,
  canonicalId: string,
) {
  const existing = values.get(modelName);
  if (existing === undefined || existing === canonicalId) {
    values.set(modelName, canonicalId);
    return;
  }
  values.set(modelName, null);
}

function supportsCapability(
  model: ProviderWithModels['models'][number],
  capability: string,
) {
  if (model.capabilities?.length) {
    return model.capabilities.some((value) => value.trim() === capability);
  }
  return (model.capability ?? '').trim() === capability;
}

export function flattenModels(providers: SettingsProvider[]): SettingsModelOption[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      capability: model.capability,
      id: model.id,
      invoke: model.invoke,
      kind: model.kind,
      label: `${provider.id} :: ${model.name}`,
      name: model.name,
      providerId: provider.id,
      providerName: provider.name,
    })),
  );
}

export function modelOptionsForCapability(
  models: SettingsModelOption[],
  capability: string,
) {
  return models
    .filter((model) => model.capability === capability)
    .map((model) => ({ label: model.label, value: model.id }));
}

export function otherDefaultKeys(defaults: SettingsDefaults) {
  const keys = Object.keys(defaults).filter((key) => !MODEL_DEFAULT_KEYS.has(key));
  return keys.includes(EXP_MODE_KEY) ? keys : [EXP_MODE_KEY, ...keys];
}

function validateProviders(providers: ProviderDraft[]) {
  const seenProviders = new Set<string>();

  providers.forEach((provider) => {
    const providerId = provider.id.trim();
    if (!providerId) {
      ensureProviderIsEmpty(provider);
      return;
    }
    if (seenProviders.has(providerId)) {
      throw new Error(`Duplicate provider id: ${providerId}`);
    }
    seenProviders.add(providerId);
    validateModels(provider);
  });
}

function validateModels(provider: ProviderDraft) {
  const seenModels = new Set<string>();

  provider.models.forEach((model) => {
    const modelName = model.name.trim();
    if (!modelName) {
      ensureModelIsEmpty(provider, model);
      return;
    }
    if (seenModels.has(modelName)) {
      throw new Error(`Duplicate model "${modelName}" in provider ${provider.id.trim() || '(new provider)'}`);
    }
    seenModels.add(modelName);
    if (model.capability !== IMAGE_CAPABILITY && model.capability !== 'chat') {
      throw new Error(`Unsupported capability "${model.capability}" for ${provider.id.trim() || 'provider'}`);
    }
  });
}

function ensureProviderIsEmpty(provider: ProviderDraft) {
  const hasData =
    provider.baseUrl.trim() ||
    provider.apiKey.trim() ||
    provider.apiKeyMasked.trim() ||
    provider.models.some((model) => model.name.trim() || model.invoke.trim());

  if (hasData) {
    throw new Error('Provider rows with data must include a provider id.');
  }
}

function ensureModelIsEmpty(provider: ProviderDraft, model: SettingsModel) {
  if (model.capability.trim() !== 'chat' || model.invoke.trim()) {
    throw new Error(`Model rows in provider ${provider.id.trim() || '(new provider)'} must include a name.`);
  }
}
