type QueryValue = boolean | number | string | null | undefined;
type QueryParams = Record<string, QueryValue>;
type JsonInit = Omit<RequestInit, 'body'> & {
  body?: BodyInit | FormData | Record<string, unknown> | null;
};

export class ExamplesApiError extends Error {
  details: unknown;
  path: string;
  status: number;

  constructor(path: string, status: number, details: unknown) {
    super(`API ${status} for ${path}`);
    this.name = 'ExamplesApiError';
    this.details = details;
    this.path = path;
    this.status = status;
  }
}

export type ExamplePriority = 1 | 2 | 3;

export type ExampleRow = {
  id: string;
  discipline: string;
  title_en: string;
  title_zh: string;
  method_content_en: string;
  method_content_zh: string;
  caption_en: string;
  caption_zh: string;
  suggested_aspect_ratio: string | null;
  image_path: string | null;
  priority: ExamplePriority;
  created_at: string;
  updated_at: string;
};

export type ExampleCreateBody = Omit<
  ExampleRow,
  'created_at' | 'id' | 'image_path' | 'updated_at'
>;

export type ExampleUpdateBody = Partial<ExampleCreateBody>;
export type ExampleSearchHit = ExampleRow & { score: number };

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
      ...(requestBody && !(requestBody instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload = await readResponseBody(response);
  if (!response.ok) throw new ExamplesApiError(finalPath, response.status, payload);
  return payload as T;
}

export function listExamples(): Promise<ExampleRow[]> {
  return request<ExampleRow[]>('/api/examples');
}

export function searchExamples(query: string, topK = 10): Promise<ExampleSearchHit[]> {
  return request<ExampleSearchHit[]>('/api/examples/search', undefined, { query, top_k: topK });
}

export function getExample(id: string): Promise<ExampleRow> {
  return request<ExampleRow>(`/api/examples/${id}`);
}

export function createExample(body: ExampleCreateBody): Promise<ExampleRow> {
  return request<ExampleRow>('/api/examples', { body, method: 'POST' });
}

export function updateExample(id: string, patch: ExampleUpdateBody): Promise<ExampleRow> {
  return request<ExampleRow>(`/api/examples/${id}`, { body: patch, method: 'PATCH' });
}

export function deleteExample(id: string): Promise<void> {
  return request<void>(`/api/examples/${id}`, { method: 'DELETE' });
}

export function uploadExampleImage(id: string, file: File): Promise<ExampleRow> {
  const formData = new FormData();
  formData.set('file', file);
  return request<ExampleRow>(`/api/examples/${id}/image`, { body: formData, method: 'POST' });
}

export function exampleImageUrl(id: string): string {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  return new URL(`/api/examples/${id}/image`, origin).toString();
}
