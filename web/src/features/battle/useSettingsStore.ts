import { create } from 'zustand';
import type { ModelOption, SettingsDefaults } from './types';

type ProviderModelPayload = {
  capabilities?: string[];
  capability?: string;
  id?: string;
  kind?: string;
  name?: string;
};

type ProviderPayload = {
  id?: string;
  models?: ProviderModelPayload[];
  name?: string;
};

type ProvidersResponse = {
  providers?: ProviderPayload[];
};

type DefaultsResponse = {
  defaults?: Record<string, string>;
};

type LoadStatus = 'error' | 'idle' | 'loading' | 'ready';

type SettingsState = {
  defaults: SettingsDefaults;
  error: string | null;
  imageModelOptions: ModelOption[];
  load: () => Promise<void>;
  mainModelOptions: ModelOption[];
  status: LoadStatus;
};

async function fetchJson<T>(path: string) {
  const response = await fetch(path);
  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }
  return payload;
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Settings request failed';
}

function hasCapability(model: ProviderModelPayload, capability: string) {
  if (model.kind === capability) return true;
  if (model.capability === capability) return true;
  return Array.isArray(model.capabilities) && model.capabilities.includes(capability);
}

function collectModels(providers: ProviderPayload[], capability: string) {
  const options: ModelOption[] = [];
  for (const provider of providers) {
    const providerId = typeof provider.id === 'string' ? provider.id : '';
    if (!providerId || !Array.isArray(provider.models)) continue;
    for (const model of provider.models) {
      const modelName = typeof model.name === 'string' ? model.name : '';
      if (!modelName || !hasCapability(model, capability)) continue;
      options.push({
        id: typeof model.id === 'string' && model.id ? model.id : `${providerId}::${modelName}`,
        label: `${provider.name ?? providerId} / ${modelName}`,
        modelName,
        providerId,
        providerName: typeof provider.name === 'string' && provider.name ? provider.name : providerId,
      });
    }
  }
  return options;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  defaults: {},
  error: null,
  imageModelOptions: [],
  load: async () => {
    if (get().status === 'loading') return;
    set({ error: null, status: 'loading' });
    try {
      const [providersResponse, defaultsResponse] = await Promise.all([
        fetchJson<ProvidersResponse>('/api/providers'),
        fetchJson<DefaultsResponse>('/api/defaults'),
      ]);
      const providers = Array.isArray(providersResponse.providers) ? providersResponse.providers : [];
      set({
        defaults: defaultsResponse.defaults ?? {},
        error: null,
        imageModelOptions: collectModels(providers, 'image'),
        mainModelOptions: collectModels(providers, 'text'),
        status: 'ready',
      });
    } catch (error) {
      set({ error: toMessage(error), status: 'error' });
    }
  },
  mainModelOptions: [],
  status: 'idle',
}));
