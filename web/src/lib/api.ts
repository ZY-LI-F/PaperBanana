type QueryValue = boolean | number | string | null | undefined;
type QueryParams = Record<string, QueryValue>;

export class ApiError extends Error {
  details: unknown;
  path: string;
  status: number;

  constructor(path: string, status: number, details: unknown) {
    super(`API ${status} for ${path}`);
    this.name = 'ApiError';
    this.details = details;
    this.path = path;
    this.status = status;
  }
}

export type ApiHealth = {
  ok: boolean;
  version: string;
};

export type RunKind = 'battle' | 'generate' | 'refine';
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'paused' | 'cancelled';

export type RunSummary = {
  created_at: string;
  id: string;
  kind: RunKind;
  status: RunStatus;
  updated_at: string;
};

export type RunDetail = RunSummary & {
  caption?: string;
  error?: string | null;
  image_model?: string;
  main_model?: string;
  method_content?: string;
  planner_prompt?: string;
  visualizer_prompt?: string;
};

export type ProviderSummary = {
  configured: boolean;
  id: string;
  model_count: number;
  name: string;
};

export type RunEvent = {
  data?: Record<string, unknown>;
  message?: string;
  run_id?: string;
  stage?: string;
  status?: string;
  type: string;
};

type JsonInit = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | null;
};

type SseHandlers<T> = {
  event?: string;
  onError?: (event: Event) => void;
  onMessage: (payload: T, event: MessageEvent<string>) => void;
};

function buildPath(path: string, query?: QueryParams) {
  if (!query) return path;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function isRawBody(body: JsonInit['body']): body is BodyInit {
  return (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    typeof body === 'string'
  );
}

async function readResponseBody(response: Response) {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  if (contentType.startsWith('text/')) return response.text();
  return response.blob();
}

async function request<T>(path: string, init?: JsonInit, query?: QueryParams): Promise<T> {
  const finalPath = buildPath(path, query);
  const body = init?.body && !isRawBody(init.body) ? JSON.stringify(init.body) : init?.body;
  const response = await fetch(finalPath, {
    ...init,
    body,
    headers: {
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = await readResponseBody(response);
  if (!response.ok) throw new ApiError(finalPath, response.status, payload);
  return payload as T;
}

export function connectEventStream<T>(path: string, handlers: SseHandlers<T>, query?: QueryParams) {
  const source = new EventSource(buildPath(path, query));
  const onMessage = (event: MessageEvent<string>) => {
    handlers.onMessage(JSON.parse(event.data) as T, event);
  };

  if (handlers.event) {
    source.addEventListener(handlers.event, onMessage as EventListener);
  } else {
    source.onmessage = onMessage;
  }

  source.onerror = (event) => handlers.onError?.(event);

  return {
    close: () => source.close(),
    source,
  };
}

export const api = {
  battle: {
    create: (payload: Record<string, unknown>) => request<RunDetail>('/api/battle', { body: payload, method: 'POST' }),
  },
  health: () => request<ApiHealth>('/api/health'),
  logs: {
    stream: (query: QueryParams, handlers: SseHandlers<RunEvent>) => connectEventStream('/api/logs/events', handlers, query),
  },
  runs: {
    cancel: (runId: string) => request<RunDetail>(`/api/runs/${runId}/cancel`, { method: 'POST' }),
    create: (payload: Record<string, unknown>) => request<RunDetail>('/api/runs', { body: payload, method: 'POST' }),
    delete: (runId: string) => request<void>(`/api/runs/${runId}`, { method: 'DELETE' }),
    detail: (runId: string) => request<RunDetail>(`/api/runs/${runId}`),
    list: (query?: QueryParams) => request<RunSummary[]>('/api/runs', undefined, query),
    resume: (runId: string) => request<RunDetail>(`/api/runs/${runId}/resume`, { method: 'POST' }),
    stream: (runId: string, handlers: SseHandlers<RunEvent>) => connectEventStream(`/api/runs/${runId}/events`, handlers),
  },
  settings: {
    defaults: () => request<Record<string, unknown>>('/api/defaults'),
    providers: () => request<ProviderSummary[]>('/api/providers'),
    updateDefaults: (payload: Record<string, unknown>) => request<Record<string, unknown>>('/api/defaults', { body: payload, method: 'PUT' }),
    updateProviders: (payload: Record<string, unknown>) => request<Record<string, unknown>>('/api/providers', { body: payload, method: 'PUT' }),
  },
};
