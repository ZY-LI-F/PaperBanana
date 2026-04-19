import type { BattleGridItem, GalleryImage, LogEntry, StageTimelineItem } from '../components/ui';
import type { Option } from '../components/ui/shared';

export const modelOptions: Option[] = [
  { label: 'OpenAI · gpt-image-1', value: 'openai::gpt-image-1' },
  { label: 'Google · imagen-4', value: 'google::imagen-4' },
  { label: 'Anthropic · orchestration', value: 'anthropic::orchestration' },
];

export const galleryImages: GalleryImage[] = [
  { id: 'hero', previewLabel: 'Planner Output', subtitle: 'Method-aware composition and emphasis zones', title: 'Candidate A', tone: 'ok' },
  { id: 'variant', previewLabel: 'Stylist Pass', subtitle: 'Clinical-blue annotation pass with cleaner labels', title: 'Candidate B', tone: 'neutral' },
  { id: 'critic', previewLabel: 'Critic Revision', subtitle: 'Contrast and spacing tightened after review', title: 'Candidate C', tone: 'warn' },
];

export const battleItems: BattleGridItem[] = [
  { elapsedLabel: '12.4 s', id: 'battle-a', model: 'OpenAI · gpt-image-1', note: 'Strong balance between structure and callouts.', previewLabel: 'Image Model A', score: '8.9 / 10', status: 'succeeded', tone: 'ok' },
  { elapsedLabel: '15.8 s', id: 'battle-b', model: 'Google · imagen-4', note: 'Sharper labels, flatter iconography.', previewLabel: 'Image Model B', score: '8.4 / 10', status: 'running', tone: 'neutral' },
  { elapsedLabel: 'Queued', id: 'battle-c', model: 'Fal · flux-pro', note: 'Waiting for visualizer slot.', status: 'queued' },
];

export const logEntries: LogEntry[] = [
  { id: '1', level: 'info', message: 'Run queued and persistence row created.', stage: 'scheduler', timestamp: '09:40:12' },
  { id: '2', level: 'info', message: 'Planner prompt assembled from caption, method, and retrieval context.', stage: 'planner', timestamp: '09:40:18' },
  { id: '3', level: 'warn', message: 'One reference caption lacked figure-level metadata; continuing with fallback context.', stage: 'retriever', timestamp: '09:40:22' },
  { id: '4', level: 'error', message: 'Visualizer candidate 2 timed out after 30s and was rescheduled.', stage: 'visualizer', timestamp: '09:40:36' },
];

export const timelineStages: StageTimelineItem[] = [
  { detail: 'References pulled from the indexed corpus and normalized into stage payloads.', name: 'Retriever', status: 'succeeded' },
  { detail: 'Diagram composition prompt produced with method-specific structure.', name: 'Planner', status: 'succeeded' },
  { detail: 'Visual tone and callout hierarchy being refined before fan-out.', name: 'Stylist', status: 'running' },
  { detail: 'Candidate generation awaits stylist completion.', name: 'Visualizer', status: 'pending' },
];
