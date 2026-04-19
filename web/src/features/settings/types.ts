import type { Option } from '../../components/ui/shared';

export const IMAGE_CAPABILITY = 'image';
export const MAIN_MODEL_KEY = 'main_model';
export const IMAGE_MODEL_KEY = 'image_gen_model';
export const EXP_MODE_KEY = 'exp_mode';

export const providerTypeOptions: Option[] = [
  { label: 'OpenAI-compatible', value: 'openai' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Anthropic', value: 'anthropic' },
];

export const capabilityOptions: Option[] = [
  { label: 'Chat', value: 'chat' },
  { label: 'Image', value: IMAGE_CAPABILITY },
];

export const invokeOptions: Option[] = [
  { label: 'Auto', value: '' },
  { label: 'Gemini native', value: 'gemini_native' },
  { label: 'OpenAI chat', value: 'openai_chat' },
  { label: 'OpenAI images', value: 'openai_images' },
  { label: 'OpenAI chat modalities', value: 'openai_chat_modalities' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'DashScope multimodal', value: 'dashscope_multimodal' },
];

export type SettingsDefaults = Record<string, string>;

export type SettingsModel = {
  capability: string;
  capabilities: string[];
  id: string;
  invoke: string;
  kind: string;
  name: string;
};

export type SettingsProvider = {
  apiKeyMasked: string;
  baseUrl: string;
  id: string;
  models: SettingsModel[];
  name: string;
  type: string;
};

export type ProviderDraft = SettingsProvider & {
  apiKey: string;
};

export type SettingsModelOption = {
  capability: string;
  id: string;
  invoke: string;
  kind: string;
  label: string;
  name: string;
  providerId: string;
  providerName: string;
};

export type ProviderPayload = {
  api_key?: string;
  api_key_masked?: string;
  base_url: string;
  id: string;
  models: Array<{
    capability: string;
    invoke: string;
    name: string;
  }>;
  type: string;
};

export type ProvidersSavePayload = {
  defaults: SettingsDefaults;
  providers: ProviderPayload[];
};
