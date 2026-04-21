import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { RefCreateBody, RefRow, RefTask } from '../../api/refs';
import { Button } from '../ui/Button';
import { ErrorText } from '../ui/ErrorText';
import { Field } from '../ui/Field';
import { HelperText } from '../ui/HelperText';
import { Label } from '../ui/Label';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { controlClass } from '../ui/shared';
import { getCategorySelectValue, REF_CATEGORY_OPTIONS, REF_TASK_LABELS } from './constants';

type RefEditorProps = {
  onClose: () => void;
  onSave: (payload: RefCreateBody) => Promise<void>;
  open: boolean;
  row: RefRow | null;
  task: RefTask;
};

type EditorState = {
  additionalInfoText: string;
  categoryValue: string;
  content: string;
  customCategory: string;
  visualIntent: string;
};

export function RefEditor({ onClose, onSave, open, row, task }: RefEditorProps) {
  const [state, setState] = useState<EditorState>(() => createEditorState(row));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setState(createEditorState(row));
    setJsonError(null);
    setSubmitError(null);
    setIsSaving(false);
  }, [open, row]);

  async function handleSubmit() {
    const payload = buildPayload(state);
    if ('error' in payload) {
      setJsonError(payload.error);
      return;
    }
    setIsSaving(true);
    setJsonError(null);
    setSubmitError(null);
    try {
      await onSave(payload.value);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      description={`${REF_TASK_LABELS[task]} refs 维护 content、visual intent、category 与 additional_info。`}
      footer={<EditorFooter isSaving={isSaving} onClose={onClose} onSave={handleSubmit} />}
      onClose={onClose}
      open={open}
      size="lg"
      title={row ? '编辑条目 / Edit ref' : '新建条目 / New ref'}
    >
      <div className="space-y-5">
        {submitError ? <ErrorBanner message={submitError} /> : null}

        <Field>
          <Label htmlFor="ref-content">Content</Label>
          <Textarea
            id="ref-content"
            rows={7}
            value={state.content}
            onChange={(event) => patchState(setState, 'content', event.currentTarget.value)}
          />
        </Field>

        <Field>
          <Label htmlFor="ref-visual-intent">Visual intent</Label>
          <Textarea
            id="ref-visual-intent"
            rows={5}
            value={state.visualIntent}
            onChange={(event) => patchState(setState, 'visualIntent', event.currentTarget.value)}
          />
          <HelperText>列表卡片仅展示前两行，正文可保留完整描述。</HelperText>
        </Field>

        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <Field>
            <Label htmlFor="ref-category">Category</Label>
            <Select
              id="ref-category"
              options={REF_CATEGORY_OPTIONS}
              placeholder="Uncategorized"
              value={state.categoryValue}
              onChange={(event) => patchCategory(setState, event.currentTarget.value)}
            />
          </Field>
          {state.categoryValue === 'other' ? (
            <Field>
              <Label htmlFor="ref-custom-category">Other category</Label>
              <input
                className={controlClass}
                id="ref-custom-category"
                placeholder="custom"
                value={state.customCategory}
                onChange={(event) =>
                  patchState(setState, 'customCategory', event.currentTarget.value)
                }
              />
            </Field>
          ) : null}
        </div>

        <Field>
          <Label htmlFor="ref-additional-info">Additional info (JSON)</Label>
          <Textarea
            id="ref-additional-info"
            rows={8}
            value={state.additionalInfoText}
            onChange={(event) => {
              patchState(setState, 'additionalInfoText', event.currentTarget.value);
              setJsonError(null);
            }}
          />
          {jsonError ? <ErrorText>{jsonError}</ErrorText> : null}
          <HelperText>留空表示不写入。保存时必须能解析为 JSON object。</HelperText>
        </Field>
      </div>
    </Modal>
  );
}

type EditorFooterProps = {
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
};

function EditorFooter({ isSaving, onClose, onSave }: EditorFooterProps) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button disabled={isSaving} onClick={onSave}>
        {isSaving ? 'Saving…' : '保存条目 / Save ref'}
      </Button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="m-0 rounded-md border border-danger bg-subtle px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}

function createEditorState(row: RefRow | null): EditorState {
  const additionalInfoText = row?.additional_info
    ? JSON.stringify(row.additional_info, null, 2)
    : '';
  return {
    additionalInfoText,
    categoryValue: getCategorySelectValue(row?.category ?? null),
    content: row?.content ?? '',
    customCategory:
      row?.category && getCategorySelectValue(row.category) === 'other' ? row.category : '',
    visualIntent: row?.visual_intent ?? '',
  };
}

function buildPayload(state: EditorState) {
  const parsed = parseAdditionalInfo(state.additionalInfoText);
  if ('error' in parsed) return parsed;
  return {
    value: {
      additional_info: parsed.value,
      category: resolveCategory(state.categoryValue, state.customCategory),
      content: state.content.trim(),
      visual_intent: state.visualIntent.trim(),
    } satisfies RefCreateBody,
  };
}

function parseAdditionalInfo(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { value: null };
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'additional_info must be a JSON object' };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: 'additional_info JSON 解析失败' };
  }
}

function patchCategory(setState: Dispatch<SetStateAction<EditorState>>, value: string) {
  setState((current) => ({
    ...current,
    categoryValue: value,
    customCategory: value === 'other' ? current.customCategory : '',
  }));
}

function patchState<K extends keyof EditorState>(
  setState: Dispatch<SetStateAction<EditorState>>,
  field: K,
  value: EditorState[K]
) {
  setState((current) => ({ ...current, [field]: value }));
}

function resolveCategory(categoryValue: string, customCategory: string) {
  if (!categoryValue) return null;
  if (categoryValue !== 'other') return categoryValue;
  return customCategory.trim() || 'other';
}
