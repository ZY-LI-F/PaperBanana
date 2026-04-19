import type { Option } from '../../components/ui/shared';

export const aspectRatioOptions: Option[] = [
  { label: '21:9', value: '21:9' },
  { label: '16:9', value: '16:9' },
  { label: '3:2', value: '3:2' },
];

export const resolutionOptions: Option[] = [
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
];

export const IMAGE_INPUT_ACCEPT = 'image/png,image/jpeg,image/webp';
