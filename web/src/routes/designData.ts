import type { BattleGridItem, GalleryImage, LogEntry, StageTimelineItem } from '../components/ui';
import type { Option } from '../components/ui/shared';

function buildPreview(label: string, accent: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
      <rect width="640" height="480" fill="#f7fafc" />
      <rect x="36" y="36" width="568" height="408" rx="24" fill="#ffffff" stroke="#d8e1ea" stroke-width="2" />
      <circle cx="160" cy="180" r="82" fill="${accent}" opacity="0.18" />
      <circle cx="470" cy="150" r="58" fill="#2e6be6" opacity="0.12" />
      <path d="M124 306h388" stroke="${accent}" stroke-width="18" stroke-linecap="round" />
      <path d="M124 356h312" stroke="#b7c5d3" stroke-width="14" stroke-linecap="round" />
      <text x="124" y="120" fill="#0f172a" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">${label}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const modelOptions: Option[] = [
  { label: 'OpenAI · gpt-image-1', value: 'openai::gpt-image-1' },
  { label: 'Google · imagen-4', value: 'google::imagen-4' },
  { label: 'Anthropic · orchestration', value: 'anthropic::orchestration' },
];

export const galleryImages: GalleryImage[] = [
  { id: 'hero', src: buildPreview('Planner Output', '#0e8a7e'), subtitle: 'Method-aware composition and emphasis zones', title: 'Candidate A', tone: 'ok' },
  { id: 'variant', src: buildPreview('Stylist Pass', '#2e6be6'), subtitle: 'Clinical-blue annotation pass with cleaner labels', title: 'Candidate B', tone: 'neutral' },
  { id: 'critic', src: buildPreview('Critic Revision', '#b45309'), subtitle: 'Contrast and spacing tightened after review', title: 'Candidate C', tone: 'warn' },
];

export const battleItems: BattleGridItem[] = [
  { elapsedLabel: '12.4 s', id: 'battle-a', imageSrc: buildPreview('Image Model A', '#0e8a7e'), model: 'OpenAI · gpt-image-1', note: 'Strong balance between structure and callouts.', score: '8.9 / 10', status: 'succeeded' },
  { elapsedLabel: '15.8 s', id: 'battle-b', imageSrc: buildPreview('Image Model B', '#2e6be6'), model: 'Google · imagen-4', note: 'Sharper labels, flatter iconography.', score: '8.4 / 10', status: 'running' },
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
