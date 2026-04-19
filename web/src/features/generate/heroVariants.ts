import type { HeroVariant, RunDetailPayload, RunStagePayload } from './types';

const DOWNLOAD_STAGGER_MS = 200;
const FINAL_STAGE = 'final';
const CANDIDATE_PATTERN = /candidate_(\d+)\.png(?:$|[?#])/i;

export function buildHeroVariants(detail: RunDetailPayload): HeroVariant[] {
  return [
    ...buildFinalVariants(detail),
    ...detail.stages.flatMap((stage) => buildStageVariants(detail.id, stage)),
  ];
}

export function downloadVariants(variants: HeroVariant[]): void {
  if (typeof document === 'undefined') return;
  variants.forEach((variant, index) => {
    window.setTimeout(() => triggerDownload(variant), index * DOWNLOAD_STAGGER_MS);
  });
}

function buildFinalVariants(detail: RunDetailPayload): HeroVariant[] {
  if (!detail.final_image_url) return [];
  const count = inferFinalCandidateCount(detail);
  return Array.from({ length: count }, (_, index) =>
    createVariant(detail.id, FINAL_STAGE, index, toSiblingFinalUrl(detail.final_image_url!, index))
  );
}

function inferFinalCandidateCount(detail: RunDetailPayload): number {
  const stageCount = detail.stages.reduce(
    (max, stage) => Math.max(max, inferStageCandidateCount(stage)),
    0
  );
  const finalIndex = parseCandidateIndex(detail.final_image_url, 0);
  return Math.max(detail.num_candidates ?? 0, stageCount, finalIndex + 1, 1);
}

function inferStageCandidateCount(stage: RunStagePayload): number {
  return stage.image_urls.reduce(
    (max, url, index) => Math.max(max, parseCandidateIndex(url, index) + 1),
    0
  );
}

function buildStageVariants(runId: string, stage: RunStagePayload): HeroVariant[] {
  const seen = new Set<string>();
  return stage.image_urls.flatMap((url, index) => {
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [createVariant(runId, stage.stage_name, parseCandidateIndex(url, index), url)];
  });
}

function createVariant(
  runId: string,
  stage: string,
  candidateIndex: number,
  url: string
): HeroVariant {
  return {
    candidateIndex,
    downloadName: `${runId}_${stage}_candidate_${candidateIndex}.png`,
    id: `${stage}-${candidateIndex}`,
    label: createVariantLabel(stage, candidateIndex),
    stage,
    url,
  };
}

function createVariantLabel(stage: string, candidateIndex: number): string {
  const prefix = stage === FINAL_STAGE ? 'Final' : humanizeStageName(stage);
  return `${prefix} candidate ${candidateIndex + 1}`;
}

function humanizeStageName(stage: string): string {
  if (stage.startsWith('critic_')) {
    return `Critic ${Number(stage.replace('critic_', '')) + 1}`;
  }
  return stage.replaceAll('_', ' ').replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function parseCandidateIndex(url: string | null | undefined, fallback: number): number {
  if (!url) return fallback;
  const match = url.match(CANDIDATE_PATTERN);
  return match ? Number(match[1]) : fallback;
}

function toSiblingFinalUrl(finalUrl: string, candidateIndex: number): string {
  return finalUrl.match(CANDIDATE_PATTERN)
    ? finalUrl.replace(CANDIDATE_PATTERN, `candidate_${candidateIndex}.png`)
    : finalUrl;
}

function triggerDownload(variant: HeroVariant): void {
  const link = document.createElement('a');
  link.href = variant.url;
  link.download = variant.downloadName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
