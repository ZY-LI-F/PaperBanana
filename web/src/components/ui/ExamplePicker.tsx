import { useId, useState } from 'react';
import type { Example, ExampleLocale } from '../../data/examples';
import { EXAMPLES, getExample } from '../../data/examples';
import { Button } from './Button';
import { Field } from './Field';
import { HelperText } from './HelperText';
import { Label } from './Label';
import { Select } from './Select';

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

function buildDisciplineOptions(locale: ExampleLocale) {
  return EXAMPLES.map((example) => ({
    label: `${example.discipline} | ${locale === 'zh' ? example.title_zh : example.title_en}`,
    value: example.id,
  }));
}

function getLocalizedPayload(example: Example, locale: ExampleLocale): ExamplePickerLoadPayload {
  return {
    id: example.id,
    methodContent: locale === 'zh' ? example.method_content_zh : example.method_content_en,
    caption: locale === 'zh' ? example.caption_zh : example.caption_en,
    aspectRatio: example.suggested_aspect_ratio,
  };
}

function getDefaultExampleId() {
  const firstExample = EXAMPLES[0];
  if (!firstExample) {
    throw new Error('ExamplePicker requires at least one example.');
  }
  return firstExample.id;
}

export function ExamplePicker({
  disabled = false,
  initialLocale = 'zh',
  onLoad,
}: ExamplePickerProps) {
  const idPrefix = useId();
  const [selectedId, setSelectedId] = useState(getDefaultExampleId);
  const [locale, setLocale] = useState<ExampleLocale>(initialLocale);
  const selectedExample = getExample(selectedId);

  if (!selectedExample) {
    throw new Error(`Unknown example id: ${selectedId}`);
  }

  return (
    <div className="rounded-lg border border-border bg-subtle p-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_180px_auto] md:items-end">
        <Field>
          <Label htmlFor={`${idPrefix}-example`}>Discipline</Label>
          <Select
            disabled={disabled}
            id={`${idPrefix}-example`}
            options={buildDisciplineOptions(locale)}
            value={selectedId}
            onChange={(event) => setSelectedId(event.currentTarget.value)}
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
            options={[...localeOptions]}
            value={locale}
            onChange={(event) => setLocale(event.currentTarget.value as ExampleLocale)}
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
