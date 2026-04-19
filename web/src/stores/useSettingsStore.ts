import { create } from 'zustand';
import {
  alignDefaultsWithProviders,
  flattenModels,
} from '../features/settings/drafts';
import { buildDefaultsState } from '../features/settings/defaultsState';
import {
  fetchDefaults,
  fetchProviders,
  fetchSettingsBundle,
  fetchYaml,
  saveDefaults as persistDefaults,
  saveProviders as persistProviders,
  saveYaml as persistYaml,
} from '../features/settings/service';
import type {
  ProvidersSavePayload,
  SettingsDefaults,
  SettingsModelOption,
  SettingsProvider,
} from '../features/settings/types';

type SettingsStore = {
  defaults: SettingsDefaults;
  error: string | null;
  hasAttemptedLoad: boolean;
  hydrated: boolean;
  isLoading: boolean;
  load: (force?: boolean) => Promise<void>;
  models: SettingsModelOption[];
  providerDefaults: SettingsDefaults;
  providers: SettingsProvider[];
  saveDefaults: (defaults: SettingsDefaults) => Promise<void>;
  saveProviders: (payload: ProvidersSavePayload) => Promise<void>;
  saveYaml: (yaml: string) => Promise<void>;
  yaml: string;
};

const initialState = {
  defaults: {},
  error: null,
  hasAttemptedLoad: false,
  hydrated: false,
  isLoading: false,
  models: [],
  providerDefaults: {},
  providers: [],
  yaml: '',
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...initialState,
  load: async (force = false) => {
    const state = get();
    if (state.isLoading || (state.hasAttemptedLoad && !force)) return;
    set({ error: null, isLoading: true });
    try {
      applyBundle(set, await fetchSettingsBundle());
      set({ error: null, hasAttemptedLoad: true, isLoading: false });
    } catch (error) {
      set({ error: readError(error), hasAttemptedLoad: true, isLoading: false });
    }
  },
  saveDefaults: async (defaults) => {
    set({ error: null });
    try {
      const nextDefaults = await persistDefaults(defaults);
      const yaml = await refreshYamlSnapshot(
        'Defaults saved, but Advanced YAML could not refresh',
      );
      const defaultsState = buildDefaultsState(nextDefaults, get().providers, yaml);
      set({ ...defaultsState, error: null, hydrated: true, yaml });
    } catch (error) {
      set({ error: readError(error) });
      throw error;
    }
  },
  saveProviders: async (payload) => {
    set({ error: null });
    const currentDefaults = get().defaults;
    try {
      const providers = await persistProviders(payload);
      const payloadDefaults = buildDefaultsState(
        payload.defaults,
        providers,
        get().yaml,
      );
      set({
        defaults: alignDefaultsWithProviders(currentDefaults, providers),
        error: null,
        hydrated: true,
        models: flattenModels(providers),
        providerDefaults: payloadDefaults.providerDefaults,
        providers,
      });
      const defaultsResponse = await refreshProviderSaveState();
      const yaml = await refreshYamlSnapshot(
        'Providers saved, but Advanced YAML could not refresh',
      );
      set({
        ...buildDefaultsState(defaultsResponse, providers, yaml),
        yaml,
      });
    } catch (error) {
      set({ error: readError(error) });
      throw error;
    }
  },
  saveYaml: async (yamlText) => {
    set({ error: null });
    try {
      const yaml = await persistYaml(yamlText);
      set({ error: null, hydrated: true, yaml });
      await refreshYamlSaveState(set, yaml);
    } catch (error) {
      set({ error: readError(error) });
      throw error;
    }
  },
}));

function applyBundle(
  set: (state: Partial<SettingsStore>) => void,
  bundle: Awaited<ReturnType<typeof fetchSettingsBundle>>,
) {
  const defaultsState = buildDefaultsState(
    bundle.defaults,
    bundle.providers,
    bundle.yaml,
  );
  set({
    ...defaultsState,
    hydrated: true,
    models: flattenModels(bundle.providers),
    providers: bundle.providers,
    yaml: bundle.yaml,
  });
}

async function refreshProviderSaveState(
): Promise<SettingsDefaults> {
  try {
    return await fetchDefaults();
  } catch (error) {
    throw new Error(
      `Providers saved, but defaults could not refresh: ${readError(error)}`,
    );
  }
}

async function refreshYamlSnapshot(
  prefix: string,
): Promise<string> {
  try {
    return await fetchYaml();
  } catch (error) {
    throw new Error(`${prefix}: ${readError(error)}`);
  }
}

async function refreshYamlSaveState(
  set: (state: Partial<SettingsStore>) => void,
  yaml: string,
) {
  try {
    const [providers, defaultsResponse] = await Promise.all([
      fetchProviders(),
      fetchDefaults(),
    ]);
    set({
      ...buildDefaultsState(defaultsResponse, providers, yaml),
      hydrated: true,
      models: flattenModels(providers),
      providers,
    });
  } catch (error) {
    throw new Error(
      `YAML saved, but provider data could not refresh: ${readError(error)}`,
    );
  }
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown settings error';
}
