import { useEffect, useState } from 'react';
import {
  createExample,
  deleteExample,
  listExamples,
  updateExample,
  uploadExampleImage,
  ExamplesApiError,
  type ExamplePriority,
  type ExampleRow,
} from '../api/examples';
import { ExampleEditor, type ExampleDraft } from '../components/examples/ExampleEditor';
import { ExampleList } from '../components/examples/ExampleList';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';

type EditorIntent = 'create' | 'edit' | 'image';

export default function ExamplesRoute() {
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorIntent, setEditorIntent] = useState<EditorIntent>('create');
  const [draft, setDraft] = useState<ExampleDraft>(emptyDraft());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void refreshExamples();
  }, []);

  async function refreshExamples() {
    try {
      setExamples(sortExamples(await listExamples()));
      setPageError(null);
    } catch (error) {
      setPageError(describeError(error));
    }
  }

  function openEditor(intent: EditorIntent, example?: ExampleRow) {
    setEditorIntent(intent);
    setDraft(example ? toDraft(example) : emptyDraft());
    setImageFile(null);
    setEditorError(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setImageFile(null);
    setEditorError(null);
  }

  async function handleSave() {
    setIsSaving(true);
    let createdSaved: ExampleRow | null = null;
    try {
      const payload = toPayload(draft);
      const saved = draft.id
        ? await updateExample(draft.id, payload)
        : await createExample(payload);
      // Persist the saved id onto draft BEFORE the image upload, so that
      // if the upload fails the user's retry hits updateExample on the
      // same row instead of POSTing a duplicate.
      if (!draft.id) {
        createdSaved = saved;
        setDraft((current) => ({ ...current, id: saved.id }));
        setEditorIntent('edit');
      }
      if (imageFile) await uploadExampleImage(saved.id, imageFile);
      await refreshExamples();
      closeEditor();
    } catch (error) {
      if (createdSaved !== null) {
        try {
          await refreshExamples();
        } catch {
          // Keep surfacing the original save error when the recovery refresh also fails.
        }
      }
      setEditorError(describeError(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(example: ExampleRow) {
    const confirmed = window.confirm(`删除示例 “${example.title_zh}” 后无法恢复，继续吗？`);
    if (!confirmed) return;
    try {
      await deleteExample(example.id);
      await refreshExamples();
    } catch (error) {
      setPageError(describeError(error));
    }
  }

  function updateDraft<K extends keyof ExampleDraft>(field: K, value: ExampleDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface px-6 py-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Tag tone="ok">Examples</Tag>
            <div>
              <h1 className="m-0 text-2xl font-semibold text-primary">示例库 / Examples Library</h1>
              <p className="m-0 text-sm text-secondary">
                管理 few-shot 示例内容、优先级和配图，供生成入口与检索接口统一复用。
              </p>
            </div>
          </div>
          <Button onClick={() => openEditor('create')}>新建示例 / New Example</Button>
        </div>
      </section>

      {pageError ? (
        <p className="m-0 rounded-lg border border-danger bg-subtle px-4 py-3 text-sm text-danger">
          {pageError}
        </p>
      ) : null}

      <ExampleList
        examples={examples}
        onDelete={handleDelete}
        onEdit={(example) => openEditor('edit', example)}
        onUploadImage={(example) => openEditor('image', example)}
      />

      <ExampleEditor
        draft={draft}
        error={editorError}
        imageFile={imageFile}
        intent={editorIntent}
        isSaving={isSaving}
        open={editorOpen}
        onChange={updateDraft}
        onClose={closeEditor}
        onImageChange={setImageFile}
        onSave={handleSave}
      />
    </div>
  );
}

function emptyDraft(): ExampleDraft {
  return {
    discipline: '',
    title_en: '',
    title_zh: '',
    method_content_en: '',
    method_content_zh: '',
    caption_en: '',
    caption_zh: '',
    suggested_aspect_ratio: '',
    priority: 2,
  };
}

function toDraft(example: ExampleRow): ExampleDraft {
  return {
    id: example.id,
    discipline: example.discipline,
    title_en: example.title_en,
    title_zh: example.title_zh,
    method_content_en: example.method_content_en,
    method_content_zh: example.method_content_zh,
    caption_en: example.caption_en,
    caption_zh: example.caption_zh,
    suggested_aspect_ratio: example.suggested_aspect_ratio ?? '',
    priority: example.priority,
    image_path: example.image_path,
  };
}

function toPayload(draft: ExampleDraft) {
  return {
    discipline: draft.discipline,
    title_en: draft.title_en,
    title_zh: draft.title_zh,
    method_content_en: draft.method_content_en,
    method_content_zh: draft.method_content_zh,
    caption_en: draft.caption_en,
    caption_zh: draft.caption_zh,
    suggested_aspect_ratio: draft.suggested_aspect_ratio || null,
    priority: draft.priority as ExamplePriority,
  };
}

function sortExamples(rows: ExampleRow[]) {
  return [...rows].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.discipline.localeCompare(right.discipline);
  });
}

function describeError(error: unknown) {
  if (error instanceof ExamplesApiError) {
    const detail = (error.details as { detail?: string } | undefined)?.detail;
    return detail || `Request failed with ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}
