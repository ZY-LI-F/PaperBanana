import { useEffect, useMemo, useState } from 'react';
import { Card, Empty, HelperText, RunStatusChip, Tag } from '../../components/ui';
import type { RunStatus } from '../../components/ui/shared';
import { downloadVariants } from './utils';
import type { HeroVariant } from './types';

type HeroGalleryProps = {
  onSelect?: (id: string) => void;
  runId: string | null;
  runStatus: RunStatus | null;
  selectedId?: string | null;
  variants: HeroVariant[];
};

const TERMINAL_STATUSES = new Set<RunStatus>(['cancelled', 'failed', 'paused', 'succeeded']);

export default function HeroGallery({
  onSelect,
  runId,
  runStatus,
  selectedId,
  variants,
}: HeroGalleryProps) {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(selectedId ?? null);
  const defaultSelectedId = useMemo(() => getDefaultSelectedId(variants), [variants]);
  const activeSelectedId = resolveSelectedId(
    variants,
    selectedId ?? localSelectedId,
    defaultSelectedId
  );

  useEffect(() => {
    if (selectedId !== undefined) return;
    if (activeSelectedId === localSelectedId) return;
    setLocalSelectedId(activeSelectedId);
  }, [activeSelectedId, localSelectedId, selectedId]);

  if (!variants.length) {
    return <HeroGalleryEmpty runId={runId} runStatus={runStatus} />;
  }

  const selectedVariant =
    variants.find((variant) => variant.id === activeSelectedId) ?? variants.at(-1)!;
  return (
    <div className="space-y-4">
      <HeroPreview runId={runId} runStatus={runStatus} variant={selectedVariant} />
      <VariantSwitcher
        activeId={selectedVariant.id}
        onSelect={(id) => handleSelect(id, onSelect, setLocalSelectedId)}
        variants={variants}
      />
    </div>
  );
}

function HeroPreview({
  runId,
  runStatus,
  variant,
}: {
  runId: string | null;
  runStatus: RunStatus | null;
  variant: HeroVariant;
}) {
  return (
    <Card
      subtitle="Selected final or intermediate artifact. Download uses the exact same-origin image URL rendered in the preview."
      title="Artifact hero"
      actions={<HeroActions variant={variant} />}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {runStatus ? <RunStatusChip status={runStatus} /> : null}
          {runId ? <Tag tone="neutral">{runId}</Tag> : null}
          <Tag tone="neutral">{formatVariantTag(variant)}</Tag>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border bg-subtle p-3">
          <img
            alt={variant.label}
            className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"
            data-testid="hero-gallery-image"
            src={variant.url}
          />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-b-lg bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-4 pt-12 text-white">
            <p className="m-0 text-sm font-semibold">{variant.label}</p>
            <p className="m-0 text-xs uppercase tracking-[var(--tracking-eyebrow)] text-white/80">
              {formatVariantTag(variant)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function HeroActions({ variant }: { variant: HeroVariant }) {
  return (
    <>
      <a
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-subtle"
        download={variant.downloadName}
        href={variant.url}
      >
        Download
      </a>
      <a
        className="rounded-md bg-accent1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        href={variant.url}
        rel="noreferrer"
        target="_blank"
      >
        Open full size
      </a>
    </>
  );
}

function VariantSwitcher({
  activeId,
  onSelect,
  variants,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  variants: HeroVariant[];
}) {
  const groups = useMemo(() => groupVariants(variants), [variants]);
  return (
    <Card
      subtitle="Final candidates are pinned first, followed by each stage in pipeline order."
      title="Variant switcher"
    >
      <div className="space-y-5">
        {groups.map((group) => (
          <section className="space-y-3" key={group.stage}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-primary">
                  {formatStageTitle(group.stage)}
                </p>
                <p className="m-0 text-xs text-secondary">
                  {group.variants.length} candidate{group.variants.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                className="text-sm font-medium text-accent2 hover:underline"
                onClick={() => downloadVariants(group.variants)}
                type="button"
              >
                Download all
              </button>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max gap-3">
                {group.variants.map((variant) => (
                  <button
                    aria-pressed={variant.id === activeId}
                    className={buildTileClass(variant.id === activeId)}
                    key={variant.id}
                    onClick={() => onSelect(variant.id)}
                    type="button"
                  >
                    <img
                      alt={variant.label}
                      className="h-24 w-24 rounded-md border border-border bg-subtle object-cover"
                      src={variant.url}
                    />
                    <span className="line-clamp-2 text-left text-xs font-semibold text-primary">
                      {variant.label}
                    </span>
                    <span className="text-left text-[11px] text-secondary">
                      {formatVariantTag(variant)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}

function HeroGalleryEmpty({
  runId,
  runStatus,
}: {
  runId: string | null;
  runStatus: RunStatus | null;
}) {
  const isTerminal = runStatus ? TERMINAL_STATUSES.has(runStatus) : false;
  return (
    <Card
      subtitle="The selected artifact will stay pinned here once image URLs become available."
      title="Artifact hero"
    >
      {isTerminal ? (
        <HelperText>No stage or final image artifacts were returned for this run.</HelperText>
      ) : (
        <Empty
          description="Final artifacts will appear here once generation completes."
          title="Awaiting artifacts"
        />
      )}
      {runId ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {runStatus ? <RunStatusChip status={runStatus} /> : null}
          <Tag tone="neutral">{runId}</Tag>
        </div>
      ) : null}
    </Card>
  );
}

function handleSelect(
  id: string,
  onSelect: HeroGalleryProps['onSelect'],
  setLocalSelectedId: (id: string) => void
) {
  setLocalSelectedId(id);
  onSelect?.(id);
}

function getDefaultSelectedId(variants: HeroVariant[]): string | null {
  return variants.find((variant) => variant.stage === 'final')?.id ?? variants.at(-1)?.id ?? null;
}

function resolveSelectedId(
  variants: HeroVariant[],
  requestedId: string | null | undefined,
  fallbackId: string | null
) {
  if (requestedId && variants.some((variant) => variant.id === requestedId)) {
    return requestedId;
  }
  return fallbackId;
}

function groupVariants(variants: HeroVariant[]) {
  const groups = new Map<string, HeroVariant[]>();
  variants.forEach((variant) => {
    const current = groups.get(variant.stage) ?? [];
    groups.set(variant.stage, [...current, variant]);
  });
  return Array.from(groups, ([stage, stageVariants]) => ({
    stage,
    variants: stageVariants,
  }));
}

function formatStageTitle(stage: string): string {
  if (stage === 'final') return 'Final candidates';
  if (stage.startsWith('critic_')) {
    return `Critic ${Number(stage.replace('critic_', '')) + 1}`;
  }
  return stage.replaceAll('_', ' ').replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function formatVariantTag(variant: HeroVariant): string {
  return `${variant.stage} / candidate ${variant.candidateIndex}`;
}

function buildTileClass(isActive: boolean): string {
  return [
    'flex w-32 shrink-0 flex-col gap-2 rounded-xl border p-3 text-left transition',
    isActive
      ? 'border-accent1 bg-subtle shadow-card'
      : 'border-border bg-surface hover:border-border-strong hover:bg-subtle',
  ].join(' ');
}
