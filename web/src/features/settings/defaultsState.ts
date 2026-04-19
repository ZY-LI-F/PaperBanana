import { alignDefaultsWithProviders, normalizeDefaults } from './drafts';
import {
  IMAGE_MODEL_KEY,
  MAIN_MODEL_KEY,
  type SettingsDefaults,
  type SettingsProvider,
} from './types';

const MAIN_MODEL_NAME_KEY = 'main_model_name';
const IMAGE_MODEL_NAME_KEY = 'image_gen_model_name';
const DEFAULTS_SECTION = 'defaults:';

type DefaultsState = {
  defaults: SettingsDefaults;
  providerDefaults: SettingsDefaults;
};

export function buildDefaultsState(
  defaults: SettingsDefaults,
  providers: SettingsProvider[],
  yaml: string,
): DefaultsState {
  const normalizedDefaults = normalizeDefaults(defaults);
  const persistedKeys = parsePersistedDefaultKeys(yaml);
  return {
    defaults: alignDefaultsWithProviders(normalizedDefaults, providers),
    providerDefaults: alignDefaultsWithProviders(
      removeSyntheticCanonicalDefaults(normalizedDefaults, persistedKeys),
      providers,
    ),
  };
}

function removeSyntheticCanonicalDefaults(
  defaults: SettingsDefaults,
  persistedKeys: Set<string>,
): SettingsDefaults {
  return Object.fromEntries(
    Object.entries(defaults).filter(([key, value]) => {
      if (key === MAIN_MODEL_KEY) {
        return shouldKeepCanonicalDefault(
          key,
          value,
          defaults[MAIN_MODEL_NAME_KEY] ?? '',
          persistedKeys,
        );
      }
      if (key === IMAGE_MODEL_KEY) {
        return shouldKeepCanonicalDefault(
          key,
          value,
          defaults[IMAGE_MODEL_NAME_KEY] ?? '',
          persistedKeys,
        );
      }
      return true;
    }),
  );
}

function shouldKeepCanonicalDefault(
  key: string,
  value: string,
  legacyValue: string,
  persistedKeys: Set<string>,
) {
  return persistedKeys.has(key) || value !== legacyValue;
}

function parsePersistedDefaultKeys(yaml: string) {
  const keys = new Set<string>();
  let inDefaults = false;

  yaml.split(/\r?\n/).forEach((line) => {
    if (!inDefaults) {
      inDefaults = line.trim() === DEFAULTS_SECTION;
      return;
    }
    if (!line.trim() || line.trim().startsWith('#')) return;
    if (!line.startsWith('  ')) {
      inDefaults = false;
      return;
    }
    const key = line.match(/^\s{2}([A-Za-z0-9_]+):/)?.[1];
    if (key) keys.add(key);
  });

  return keys;
}
