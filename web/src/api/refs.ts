type QueryValue = boolean | number | string | null | undefined;
type QueryParams = Record<string, QueryValue>;
type JsonInit = Omit<RequestInit, 'body'> & {
  body?: BodyInit | FormData | Record<string, unknown> | null;
};

export class RefsApiError extends Error {
  details: unknown;
  path: string;
  status: number;
  statusText: string;

  constructor(path: string, status: number, statusText: string, details: unknown) {
    super(`API ${status}${statusText ? ` ${statusText}` : ''} for ${path}`);
    this.name = 'RefsApiError';
    this.details = details;
    this.path = path;
    this.status = status;
    this.statusText = statusText;
  }
}

export type RefTask = 'diagram' | 'plot';
export type RefImageRole = 'main' | 'variant';
export type RefImageSource = 'baseline' | 'overlay';

export type RefImage = {
  key: string;
  role: RefImageRole;
  style: string | null;
  order_index: number;
  source: RefImageSource;
};

export type RefRow = {
  id: string;
  content: string;
  visual_intent: string;
  category: string | null;
  additional_info: Record<string, unknown> | null;
  primary_image_key: string | null;
  images: RefImage[];
  _baseline: boolean;
};

export type RefSaveBody = Pick<
  RefRow,
  'additional_info' | 'category' | 'content' | 'primary_image_key' | 'visual_intent'
>;

export type RefCreateBody = Omit<RefSaveBody, 'primary_image_key'>;
export type RefUpdateBody = Partial<RefSaveBody>;
export type RefImageUploadBody = Pick<RefImage, 'order_index' | 'role' | 'style'>;
export type RefImageUpdateBody = Partial<RefImageUploadBody>;

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

function isRawBody(body: JsonInit['body']): body is BodyInit | FormData {
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
  let requestBody: BodyInit | null | undefined = init?.body as BodyInit | null | undefined;
  if (init?.body && !isRawBody(init.body)) requestBody = JSON.stringify(init.body);
  const response = await fetch(finalPath, {
    ...init,
    body: requestBody,
    headers: {
      ...(requestBody && !(requestBody instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers,
    },
  });
  const payload = await readResponseBody(response);
  if (!response.ok) {
    throw new RefsApiError(finalPath, response.status, response.statusText, payload);
  }
  return payload as T;
}

export function listRefs(task: RefTask, opts?: { signal?: AbortSignal }): Promise<RefRow[]> {
  return request<RefRow[]>('/api/refs', opts?.signal ? { signal: opts.signal } : undefined, {
    task,
  });
}

export function getRef(task: RefTask, id: string): Promise<RefRow> {
  return request<RefRow>(`/api/refs/${task}/${id}`);
}

export function createRef(task: RefTask, body: RefCreateBody): Promise<RefRow> {
  return request<RefRow>('/api/refs', { body, method: 'POST' }, { task });
}

export function updateRef(task: RefTask, id: string, patch: RefUpdateBody): Promise<RefRow> {
  return request<RefRow>(`/api/refs/${task}/${id}`, { body: patch, method: 'PATCH' });
}

export function deleteRef(task: RefTask, id: string): Promise<void> {
  return request<void>(`/api/refs/${task}/${id}`, { method: 'DELETE' });
}

export function uploadRefImage(
  task: RefTask,
  id: string,
  file: File,
  body: RefImageUploadBody
): Promise<RefRow> {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('role', body.role);
  formData.set('style', body.style ?? '');
  formData.set('order_index', String(body.order_index));
  return request<RefRow>(`/api/refs/${task}/${id}/images`, { body: formData, method: 'POST' });
}

export function updateRefImage(
  task: RefTask,
  id: string,
  key: string,
  patch: RefImageUpdateBody
): Promise<RefRow> {
  return request<RefRow>(`/api/refs/${task}/${id}/images/${encodeURIComponent(key)}`, {
    body: patch,
    method: 'PATCH',
  });
}

export function deleteRefImage(task: RefTask, id: string, key: string): Promise<void> {
  return request<void>(`/api/refs/${task}/${id}/images/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

export function refImageUrl(
  task: RefTask,
  id: string,
  image: Pick<RefImage, 'key' | 'order_index'>
) {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  const url = new URL(`/api/refs/${task}/${id}/images/${encodeURIComponent(image.key)}`, origin);
  const token = image.key || String(image.order_index);
  if (token) {
    url.searchParams.set('v', token);
  }
  return url.toString();
}
