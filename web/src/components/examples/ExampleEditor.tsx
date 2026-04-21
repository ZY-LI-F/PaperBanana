import { useEffect, useState } from 'react';
import { exampleImageUrl, type ExamplePriority } from '../../api/examples';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { HelperText } from '../ui/HelperText';
import { Label } from '../ui/Label';
import { Modal } from '../ui/Modal';
import { Textarea } from '../ui/Textarea';
import { controlClass } from '../ui/shared';
import { PrioritySelect } from './PrioritySelect';

export type ExampleDraft = {
  id?: string;
  discipline: string;
  title_en: string;
  title_zh: string;
  method_content_en: string;
  method_content_zh: string;
  caption_en: string;
  caption_zh: string;
  suggested_aspect_ratio: string;
  priority: ExamplePriority;
  image_path?: string | null;
};

type ExampleEditorProps = {
  draft: ExampleDraft;
  error: string | null;
  imageFile: File | null;
  intent: 'create' | 'edit' | 'image';
  isSaving: boolean;
  onChange: <K extends keyof ExampleDraft>(field: K, value: ExampleDraft[K]) => void;
  onClose: () => void;
  onImageChange: (file: File | null) => void;
  onSave: () => void;
  open: boolean;
};

export function ExampleEditor({
  draft,
  error,
  imageFile,
  intent,
  isSaving,
  onChange,
  onClose,
  onImageChange,
  onSave,
  open,
}: ExampleEditorProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [imageFile]);

  return (
    <Modal
      description="维护中英文方法内容、图注、优先级和示例图片。"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={isSaving} onClick={onSave}>
            {isSaving ? 'Saving…' : '保存示例 / Save Example'}
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={titleByIntent[intent]}
    >
      <div className="space-y-5">
        {error ? <p className="m-0 rounded-md border border-danger bg-subtle px-4 py-3 text-sm text-danger">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="grid gap-4">
            <Field>
              <Label htmlFor="example-discipline">Discipline</Label>
              <input
                className={controlClass}
                id="example-discipline"
                value={draft.discipline}
                onChange={(event) => onChange('discipline', event.currentTarget.value)}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <Label htmlFor="example-priority">Priority</Label>
                <PrioritySelect
                  id="example-priority"
                  value={draft.priority}
                  onChange={(value) => onChange('priority', value)}
                />
              </Field>
              <Field>
                <Label htmlFor="example-ratio">Aspect ratio</Label>
                <input
                  className={controlClass}
                  id="example-ratio"
                  placeholder="16:9"
                  value={draft.suggested_aspect_ratio}
                  onChange={(event) => onChange('suggested_aspect_ratio', event.currentTarget.value)}
                />
              </Field>
            </div>
          </div>

          <Field>
            <Label htmlFor="example-image">Image</Label>
            <label className="block cursor-pointer overflow-hidden rounded-lg border border-dashed border-border bg-subtle">
              {previewUrl ? (
                <img alt="Preview" className="h-40 w-full object-cover" src={previewUrl} />
              ) : draft.id && draft.image_path ? (
                <img
                  alt="Current example"
                  className="h-40 w-full object-cover"
                  src={exampleImageUrl({ id: draft.id, image_path: draft.image_path })}
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-muted">
                  PNG / JPG / WEBP
                </div>
              )}
              <input
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                id="example-image"
                type="file"
                onChange={(event) => onImageChange(event.currentTarget.files?.[0] ?? null)}
              />
            </label>
            <HelperText>上传后会写入本地 `results/examples/`，大小限制 5MB。</HelperText>
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <Label htmlFor="example-title-zh">标题（中文）</Label>
            <input
              className={controlClass}
              id="example-title-zh"
              value={draft.title_zh}
              onChange={(event) => onChange('title_zh', event.currentTarget.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="example-title-en">Title (English)</Label>
            <input
              className={controlClass}
              id="example-title-en"
              value={draft.title_en}
              onChange={(event) => onChange('title_en', event.currentTarget.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <Label htmlFor="example-method-zh">方法内容（中文）</Label>
            <Textarea
              id="example-method-zh"
              rows={8}
              value={draft.method_content_zh}
              onChange={(event) => onChange('method_content_zh', event.currentTarget.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="example-method-en">Method content (English)</Label>
            <Textarea
              id="example-method-en"
              rows={8}
              value={draft.method_content_en}
              onChange={(event) => onChange('method_content_en', event.currentTarget.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <Label htmlFor="example-caption-zh">图注（中文）</Label>
            <Textarea
              id="example-caption-zh"
              rows={6}
              value={draft.caption_zh}
              onChange={(event) => onChange('caption_zh', event.currentTarget.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="example-caption-en">Caption (English)</Label>
            <Textarea
              id="example-caption-en"
              rows={6}
              value={draft.caption_en}
              onChange={(event) => onChange('caption_en', event.currentTarget.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

const titleByIntent = {
  create: '新建示例 / New Example',
  edit: '编辑示例 / Edit Example',
  image: '上传示例图片 / Upload Example Image',
};
