import { RefsApiError, type RefImage, type RefRow, type RefTask } from '../../api/refs';
import type { Option } from '../ui/shared';

export const MAX_REF_IMAGE_BYTES = 10 * 1024 * 1024;

export const REF_TASK_LABELS: Record<RefTask, string> = {
  diagram: 'Diagram',
  plot: 'Plot',
};

const REF_CATEGORY_LABELS = {
  data_analysis: 'Data analysis',
  modules: 'Modules / Architecture',
  pipeline_flow: 'Pipeline flow',
  vision_perception: 'Vision perception',
} as const;

export const REF_CATEGORY_OPTIONS: Option[] = [
  { label: REF_CATEGORY_LABELS.vision_perception, value: 'vision_perception' },
  { label: REF_CATEGORY_LABELS.pipeline_flow, value: 'pipeline_flow' },
  { label: REF_CATEGORY_LABELS.modules, value: 'modules' },
  { label: REF_CATEGORY_LABELS.data_analysis, value: 'data_analysis' },
  { label: 'Other', value: 'other' },
];

export function describeRefsError(error: unknown) {
  if (error instanceof RefsApiError) {
    const detail = (error.details as { detail?: string } | undefined)?.detail;
    return detail || `Request failed with ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export function findThumbnail(row: Pick<RefRow, 'images'>) {
  return row.images[0] ?? null;
}

export function getCategoryLabel(category: string | null) {
  if (!category) return null;
  return REF_CATEGORY_LABELS[category as keyof typeof REF_CATEGORY_LABELS] ?? category;
}

export function getCategorySelectValue(category: string | null) {
  if (!category) return '';
  return REF_CATEGORY_OPTIONS.some((option) => option.value === category) ? category : 'other';
}

export function sortRefs(rows: RefRow[]) {
  return [...rows].sort((left, right) => {
    if (left._baseline !== right._baseline) return left._baseline ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}

export function toImageMeta(image: RefImage) {
  return image.style?.trim() ? `${image.role} · ${image.style}` : image.role;
}
