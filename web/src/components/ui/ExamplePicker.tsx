import { useEffect, useId, useRef, useState } from 'react';
import {
  ExamplesApiError,
  listExamples as fetchExamples,
  type ExampleRow,
} from '../../api/examples';
import type { ExampleLocale } from '../../data/examples';
import { Button } from './Button';
import { Field } from './Field';
import { HelperText } from './HelperText';
import { Label } from './Label';
import { Select } from './Select';

const MAX_ERROR_DETAIL_LENGTH = 200;

type ExamplePickerStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ExamplePickerLoadPayload = {
  id: string;
  methodContent: string;
  caption: string;
  aspectRatio?: string;
};

export type ExamplePickerProps = {
  disabled?: boolean;
  initialLocale?: ExampleLocale;
  onLoad: (payload: ExamplePickerLoadPayload) => void;
};

const localeOptions = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
] as const;

function getLocalizedPayload(example: ExampleRow, locale: ExampleLocale): ExamplePickerLoadPayload {
  return {
    id: example.id,
    methodContent: locale === 'zh' ? example.method_content_zh : example.method_content_en,
    caption: locale === 'zh' ? example.caption_zh : example.caption_en,
    aspectRatio: example.suggested_aspect_ratio ?? undefined,
  };
}

function getErrorDetails(details: unknown) {
  if (typeof details === 'string') return details.trim();
  if (details == null) return '';
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function truncate(text: string) {
  return text.length <= MAX_ERROR_DETAIL_LENGTH ? text : text.slice(0, MAX_ERROR_DETAIL_LENGTH);
}

function describeLoadError(error: unknown) {
  if (error instanceof ExamplesApiError) {
    const statusLine = [error.status, error.statusText].filter(Boolean).join(' ');
    const body = truncate(getErrorDetails(error.details));
    return [statusLine, body].filter(Boolean).join(' ');
  }
  if (error instanceof Error) return truncate(error.message);
  return 'Unknown error';
}

function buildDisciplineOptions(locale: ExampleLocale, examples: ExampleRow[]) {
  return examples.map((example) => ({
    label: `${priorityPrefix(example)}${example.discipline} | ${locale === 'zh' ? example.title_zh : example.title_en}`,
    value: example.id,
  }));
}

function priorityPrefix(example: Pick<ExampleRow, 'priority'>) {
  return example.priority === 3 ? '★ 高 · ' : '';
}

function sortExamples(rows: ExampleRow[]) {
  return [...rows].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.discipline.localeCompare(right.discipline);
  });
}

function renderLoadingState() {
  return (
    <div aria-busy="true" className="rounded-lg border border-border bg-subtle p-4">
      <p className="m-0 text-sm text-secondary">加载示例中 / Loading examples...</p>
    </div>
  );
}

function renderEmptyState() {
  return (
    <div className="rounded-lg border border-border bg-subtle p-4">
      <p className="m-0 text-sm text-secondary">
        尚未配置示例，请到{' '}
        <a className="font-medium text-primary underline underline-offset-2" href="/examples">
          示例库 / Examples page
        </a>{' '}
        新建。No examples configured yet — create one there.
      </p>
    </div>
  );
}

function renderErrorState(detail: string, disabled: boolean, onRetry: () => void) {
  return (
    <div className="rounded-lg border border-danger bg-subtle p-4" role="alert">
      <p className="m-0 text-sm font-medium text-danger">加载示例失败 / Failed to load examples</p>
      <p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-danger">{detail}</p>
      <button
        className="mt-3 inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-primary transition hover:border-border-strong hover:text-accent2 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={onRetry}
        type="button"
      >
        重试 / Retry
      </button>
    </div>
  );
}

export function ExamplePicker({
  disabled = false,
  initialLocale = 'zh',
  onLoad,
}: ExamplePickerProps) {
  const idPrefix = useId();
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [locale, setLocale] = useState<ExampleLocale>(initialLocale);
  const [status, setStatus] = useState<ExamplePickerStatus>('idle');
  const [errorDetail, setErrorDetail] = useState('');
  // Newest-wins guard: track the active controller so an in-flight request
  // that gets superseded never overwrites state from a newer one.
  const controllerRef = useRef<AbortController | null>(null);

  function loadExamples() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('loading');
    setErrorDetail('');
    void fetchExamples({ signal: controller.signal })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setExamples(sortExamples(rows));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setExamples([]);
        setStatus('error');
        setErrorDetail(describeLoadError(error));
      });
  }

  useEffect(() => {
    loadExamples();
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    if (examples.some((example) => example.id === selectedId)) return;
    setSelectedId(examples[0]?.id ?? '');
  }, [examples, selectedId, status]);

  if (status === 'idle' || status === 'loading') return renderLoadingState();
  if (status === 'error') return renderErrorState(errorDetail, disabled, loadExamples);
  if (examples.length === 0) return renderEmptyState();

  const selectedExample = examples.find((example) => example.id === selectedId) ?? examples[0];

  return (
    <div className="rounded-lg border border-border bg-subtle p-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_180px_auto] md:items-end">
        <Field>
          <Label htmlFor={`${idPrefix}-example`}>Discipline</Label>
          <Select
            disabled={disabled}
            id={`${idPrefix}-example`}
            onChange={(event) => setSelectedId(event.currentTarget.value)}
            options={buildDisciplineOptions(locale, examples)}
            value={selectedExample.id}
          />
          <HelperText>
            {selectedExample.discipline}; loads method content and caption together.
          </HelperText>
        </Field>

        <Field>
          <Label htmlFor={`${idPrefix}-locale`}>Language</Label>
          <Select
            disabled={disabled}
            id={`${idPrefix}-locale`}
            onChange={(event) => setLocale(event.currentTarget.value as ExampleLocale)}
            options={[...localeOptions]}
            value={locale}
          />
        </Field>

        <Button
          className="md:self-end"
          disabled={disabled}
          onClick={() => onLoad(getLocalizedPayload(selectedExample, locale))}
        >
          Load example
        </Button>
      </div>
    </div>
  );
}
