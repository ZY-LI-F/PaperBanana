import type { Option } from '../../components/ui/shared';
import type { SettingsModelOption } from '../settings/types';
import type {
  RefineApiResponse,
  RefineFormErrors,
  RefineFormValues,
  RefineResult,
} from './types';

const DEFAULT_ASPECT_RATIO = '21:9';
const DEFAULT_RESOLUTION = '2K';
const PNG_MIME_TYPE = 'image/png';

type RefinePayload = {
  aspectRatio: string;
  editPrompt: string;
  imageBase64: string;
  imageModel: string;
  imageSize: string;
};

export function createInitialForm(imageModel = ''): RefineFormValues {
  return {
    aspectRatio: DEFAULT_ASPECT_RATIO,
    imageModel,
    prompt: '',
    resolution: DEFAULT_RESOLUTION,
  };
}

export function buildImageModelOptions(models: SettingsModelOption[]): Option[] {
  return models
    .filter((model) => model.capability === 'image')
    .map((model) => ({ label: model.label, value: model.id }));
}

export function validateRefineForm(
  form: RefineFormValues,
  file: File | null,
  hasImageModels: boolean,
): RefineFormErrors {
  const errors: RefineFormErrors = {};
  if (!file) errors.file = 'Please upload an image before refining.';
  if (!form.prompt.trim()) errors.prompt = 'Edit instructions are required.';
  if (!form.imageModel.trim()) {
    errors.imageModel = hasImageModels
      ? 'Select an image model for the refine request.'
      : 'Configure at least one image-capable model in Settings first.';
  }
  return errors;
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

export async function requestRefine(payload: RefinePayload): Promise<RefineApiResponse> {
  const response = await fetch('/api/refine', {
    body: JSON.stringify({
      aspect_ratio: payload.aspectRatio,
      edit_prompt: payload.editPrompt,
      image_base64: payload.imageBase64,
      image_model: payload.imageModel,
      image_size: payload.imageSize,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const body = await readJsonBody(response);
  if (!response.ok) throw new Error(readErrorMessage(body, response.status));
  return parseRefineResponse(body);
}

export function createRefineResult(payload: RefineApiResponse): RefineResult {
  const blob = base64ToBlob(payload.imageBase64, PNG_MIME_TYPE);
  return {
    blob,
    downloadName: buildDownloadName(payload.finalImagePath, payload.runId),
    previewUrl: URL.createObjectURL(blob),
    runId: payload.runId,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseRefineResponse(payload: unknown): RefineApiResponse {
  const root = toRecord(payload);
  const imageBase64 = readString(root.image_base64);
  const runId = readString(root.run_id);
  if (!imageBase64 || !runId) throw new Error('Refine response is missing image data.');
  return {
    finalImagePath: readString(root.final_image_path),
    imageBase64,
    runId,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return window.btoa(binary);
}

function base64ToBlob(value: string, mimeType: string): Blob {
  const binary = window.atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function readJsonBody(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(payload: unknown, status: number): string {
  const root = toRecord(payload);
  const detail = readString(root.detail);
  return detail || `Refine request failed with status ${status}.`;
}

function buildDownloadName(finalImagePath: string, runId: string): string {
  const parts = finalImagePath.split('/').filter(Boolean);
  return parts.at(-1) || `refined-${runId}.png`;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}
