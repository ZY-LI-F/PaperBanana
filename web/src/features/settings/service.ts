import type {
  ProvidersSavePayload,
  SettingsDefaults,
  SettingsModel,
  SettingsProvider,
} from './types';

type RawDefaultsResponse = { defaults?: Record<string, unknown> };
type RawProvider = {
  api_key_masked?: string;
  base_url?: string;
  id?: string;
  models?: RawModel[];
  name?: string;
  type?: string;
};
type RawModel = {
  capabilities?: unknown;
  capability?: unknown;
  id?: unknown;
  invoke?: unknown;
  kind?: unknown;
  name?: unknown;
};
type RawProvidersResponse = { providers?: RawProvider[] };
type RawYamlResponse = { yaml?: string };

export async function fetchSettingsBundle() {
  const [providers, defaults, yaml] = await Promise.all([
    fetchProviders(),
    fetchDefaults(),
    fetchYaml(),
  ]);
  return { defaults, providers, yaml };
}

export async function fetchProviders() {
  const response = await request<RawProvidersResponse>('/api/providers');
  return (response.providers ?? []).map(mapProvider);
}

export async function fetchDefaults() {
  const response = await request<RawDefaultsResponse>('/api/defaults');
  return normalizeDefaults(response.defaults);
}

export async function fetchYaml() {
  const response = await request<RawYamlResponse>('/api/config/yaml');
  return String(response.yaml ?? '');
}

export async function saveProviders(payload: ProvidersSavePayload) {
  const response = await request<RawProvidersResponse>('/api/providers', {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return (response.providers ?? []).map(mapProvider);
}

export async function saveDefaults(defaults: SettingsDefaults) {
  const response = await request<RawDefaultsResponse>('/api/defaults', {
    body: JSON.stringify({ defaults }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return normalizeDefaults(response.defaults);
}

export async function saveYaml(yaml: string) {
  const response = await request<RawYamlResponse>('/api/config/yaml', {
    body: JSON.stringify({ yaml }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return String(response.yaml ?? '');
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new Error(readErrorMessage(path, payload));
  }
  return payload as T;
}

async function readPayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

function readErrorMessage(path: string, payload: unknown) {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = payload.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return `Request failed for ${path}`;
}

function mapProvider(provider: RawProvider): SettingsProvider {
  return {
    apiKeyMasked: String(provider.api_key_masked ?? ''),
    baseUrl: String(provider.base_url ?? ''),
    id: String(provider.id ?? ''),
    models: (provider.models ?? []).map(mapModel),
    name: String(provider.name ?? provider.id ?? ''),
    type: String(provider.type ?? 'openai'),
  };
}

function mapModel(model: RawModel): SettingsModel {
  const capability = String(model.capability ?? firstCapability(model.capabilities) ?? 'chat');
  return {
    capability,
    capabilities: normalizeCapabilities(model.capabilities, capability),
    id: String(model.id ?? ''),
    invoke: String(model.invoke ?? ''),
    kind: String(model.kind ?? (capability === 'image' ? 'image' : 'text')),
    name: String(model.name ?? ''),
  };
}

function firstCapability(value: unknown) {
  if (!Array.isArray(value)) return '';
  return String(value[0] ?? '');
}

function normalizeCapabilities(value: unknown, fallback: string) {
  if (!Array.isArray(value) || value.length === 0) return [fallback];
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizeDefaults(defaults: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    Object.entries(defaults ?? {}).map(([key, value]) => [key, String(value ?? '').trim()]),
  );
}
