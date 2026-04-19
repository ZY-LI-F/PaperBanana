import type { Option } from '../../components/ui/shared';

export const PIPELINE_DESCRIPTIONS: Record<string, string> = {
  demo_full: 'Retriever -> Planner -> Stylist -> Visualizer -> Critic -> Visualizer',
  demo_planner_critic: 'Retriever -> Planner -> Visualizer -> Critic -> Visualizer (no Stylist)',
};

export const PIPELINE_OPTIONS: Option[] = [
  { label: 'demo_planner_critic', value: 'demo_planner_critic' },
  { label: 'demo_full', value: 'demo_full' },
];

export const RETRIEVAL_OPTIONS: Option[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Manual', value: 'manual' },
  { label: 'Random', value: 'random' },
  { label: 'None', value: 'none' },
];

export const ASPECT_RATIO_OPTIONS: Option[] = [
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
  { label: '3:2', value: '3:2' },
];

export const FIGURE_SIZE_OPTIONS: Option[] = [
  { label: '1-3cm', value: '1-3cm' },
  { label: '4-6cm', value: '4-6cm' },
  { label: '7-9cm', value: '7-9cm' },
  { label: '10-13cm', value: '10-13cm' },
  { label: '14-17cm', value: '14-17cm' },
];

export const FIGURE_LANGUAGE_OPTIONS: Option[] = [
  { label: 'Auto (follow input language)', value: '' },
  { label: '简体中文 (force Chinese text)', value: 'zh' },
  { label: 'English (force English text)', value: 'en' },
];
