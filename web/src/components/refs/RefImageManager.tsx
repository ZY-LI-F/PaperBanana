import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  refImageUrl,
  type RefImage,
  type RefImageRole,
  type RefImageUpdateBody,
  type RefImageUploadBody,
  type RefRow,
  type RefTask,
} from '../../api/refs';
import { Button } from '../ui/Button';
import { ErrorText } from '../ui/ErrorText';
import { Field } from '../ui/Field';
import { HelperText } from '../ui/HelperText';
import { ImageLightbox } from '../ui/ImageLightbox';
import { Label } from '../ui/Label';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { controlClass, type Option } from '../ui/shared';
import { MAX_REF_IMAGE_BYTES, toImageMeta } from './constants';

type RefImageManagerProps = {
  onClose: () => void;
  onDeleteImage: (image: RefImage) => Promise<void>;
  onUpdateImage: (key: string, patch: RefImageUpdateBody) => Promise<void>;
  onUploadImage: (file: File, payload: RefImageUploadBody) => Promise<void>;
  open: boolean;
  row: RefRow | null;
  task: RefTask;
};

type ImageDraft = {
  orderIndex: string;
  role: RefImageRole;
  style: string;
};

const ROLE_OPTIONS: Option[] = [
  { label: 'Main', value: 'main' },
  { label: 'Variant', value: 'variant' },
];

export function RefImageManager({
  onClose,
  onDeleteImage,
  onUpdateImage,
  onUploadImage,
  open,
  row,
  task,
}: RefImageManagerProps) {
  const [drafts, setDrafts] = useState<Record<string, ImageDraft>>({});
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRole, setUploadRole] = useState<RefImageRole>('variant');
  const [uploadStyle, setUploadStyle] = useState('');
  const [uploadOrderIndex, setUploadOrderIndex] = useState('0');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setDrafts(createDrafts(row.images));
    resetUploadForm(setUploadFile, setUploadRole, setUploadStyle, setUploadOrderIndex);
    setUploadError(null);
    setActionError(null);
    setActiveKey(null);
    setIsUploading(false);
  }, [open, row]);

  async function handleUpload() {
    if (!uploadFile) {
      setUploadError('请选择图片文件');
      return;
    }
    if (uploadFile.size > MAX_REF_IMAGE_BYTES) {
      setUploadError('图片大小超过 10 MB 限制');
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    try {
      await onUploadImage(uploadFile, {
        order_index: parseOrderIndex(uploadOrderIndex),
        role: uploadRole,
        style: normalizeText(uploadStyle),
      });
      resetUploadForm(setUploadFile, setUploadRole, setUploadStyle, setUploadOrderIndex);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSaveImage(key: string) {
    const draft = drafts[key];
    if (!draft) return;
    setActiveKey(key);
    setActionError(null);
    try {
      await onUpdateImage(key, {
        order_index: parseOrderIndex(draft.orderIndex),
        role: draft.role,
        style: normalizeText(draft.style),
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setActiveKey(null);
    }
  }

  async function handleNudgeImage(image: RefImage, delta: number) {
    const draft = drafts[image.key] ?? createImageDraft(image);
    const nextOrderIndex = String(Math.max(0, parseOrderIndex(draft.orderIndex) + delta));
    setDrafts((current) => ({
      ...current,
      [image.key]: { ...draft, orderIndex: nextOrderIndex },
    }));
    setActiveKey(image.key);
    setActionError(null);
    try {
      await onUpdateImage(image.key, {
        order_index: parseOrderIndex(nextOrderIndex),
        role: draft.role,
        style: normalizeText(draft.style),
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setActiveKey(null);
    }
  }

  async function handleDelete(image: RefImage) {
    const confirmed = window.confirm(`删除图片 ${image.key} 后无法恢复，继续吗？`);
    if (!confirmed) return;
    setActiveKey(image.key);
    setActionError(null);
    try {
      await onDeleteImage(image);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setActiveKey(null);
    }
  }

  if (!row) return null;

  return (
    <Modal
      description={`维护 ${row.id} 的主图、变体图、style 标签与展示顺序。`}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title="管理图片 / Manage images"
    >
      <div className="space-y-6">
        {actionError ? <InlineError message={actionError} /> : null}
        <UploadPanel
          isUploading={isUploading}
          orderIndex={uploadOrderIndex}
          role={uploadRole}
          style={uploadStyle}
          uploadError={uploadError}
          uploadFile={uploadFile}
          onOrderIndexChange={setUploadOrderIndex}
          onRoleChange={setUploadRole}
          onStyleChange={setUploadStyle}
          onUpload={handleUpload}
          onUploadFileChange={setUploadFile}
        />

        <div className="grid gap-4">
          {row.images.map((image) => (
            <ImageCard
              draft={drafts[image.key] ?? createImageDraft(image)}
              image={image}
              isBusy={activeKey === image.key}
              key={image.key}
              refId={row.id}
              task={task}
              onDelete={handleDelete}
              onDraftChange={(field, value) => patchDraft(setDrafts, image.key, field, value)}
              onNudge={(delta) => handleNudgeImage(image, delta)}
              onSave={() => handleSaveImage(image.key)}
              onZoom={setZoomSrc}
            />
          ))}
        </div>
      </div>
      <ImageLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </Modal>
  );
}

type UploadPanelProps = {
  isUploading: boolean;
  onOrderIndexChange: (value: string) => void;
  onRoleChange: (value: RefImageRole) => void;
  onStyleChange: (value: string) => void;
  onUpload: () => void;
  onUploadFileChange: (value: File | null) => void;
  orderIndex: string;
  role: RefImageRole;
  style: string;
  uploadError: string | null;
  uploadFile: File | null;
};

function UploadPanel({
  isUploading,
  onOrderIndexChange,
  onRoleChange,
  onStyleChange,
  onUpload,
  onUploadFileChange,
  orderIndex,
  role,
  style,
  uploadError,
  uploadFile,
}: UploadPanelProps) {
  return (
    <section className="rounded-lg border border-border bg-subtle p-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_180px_140px_auto] md:items-end">
        <Field>
          <Label htmlFor="ref-upload-file">Upload image</Label>
          <input
            accept="image/png,image/jpeg,image/webp"
            className={controlClass}
            id="ref-upload-file"
            type="file"
            onChange={(event) => onUploadFileChange(event.currentTarget.files?.[0] ?? null)}
          />
          <HelperText>
            {uploadFile ? uploadFile.name : '支持 PNG / JPG / WEBP，限制 10 MB。'}
          </HelperText>
        </Field>
        <Field>
          <Label htmlFor="ref-upload-role">Role</Label>
          <Select
            id="ref-upload-role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(event) => onRoleChange(event.currentTarget.value as RefImageRole)}
          />
        </Field>
        <Field>
          <Label htmlFor="ref-upload-order">Order</Label>
          <input
            className={controlClass}
            id="ref-upload-order"
            inputMode="numeric"
            min={0}
            type="number"
            value={orderIndex}
            onChange={(event) => onOrderIndexChange(event.currentTarget.value)}
          />
        </Field>
        <Button disabled={isUploading} onClick={onUpload}>
          {isUploading ? 'Uploading…' : '上传 / Upload'}
        </Button>
      </div>
      <Field className="mt-4">
        <Label htmlFor="ref-upload-style">Style tag</Label>
        <input
          className={controlClass}
          id="ref-upload-style"
          placeholder="e.g. flat, watercolor, dark-theme"
          value={style}
          onChange={(event) => onStyleChange(event.currentTarget.value)}
        />
      </Field>
      {uploadError ? <ErrorText className="mt-3">{uploadError}</ErrorText> : null}
    </section>
  );
}

type ImageCardProps = {
  draft: ImageDraft;
  image: RefImage;
  isBusy: boolean;
  onDelete: (image: RefImage) => Promise<void>;
  onDraftChange: (field: keyof ImageDraft, value: string) => void;
  onNudge: (delta: number) => Promise<void>;
  onSave: () => void;
  onZoom: (src: string) => void;
  refId: string;
  task: RefTask;
};

function ImageCard({
  draft,
  image,
  isBusy,
  onDelete,
  onDraftChange,
  onNudge,
  onSave,
  onZoom,
  refId,
  task,
}: ImageCardProps) {
  const readonly = image.source === 'baseline';

  return (
    <article className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-[112px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-lg border border-border bg-subtle">
        <button
          aria-label="放大查看 / Zoom"
          className="block h-24 w-24 md:h-28 md:w-28"
          onClick={() => onZoom(refImageUrl(task, refId, image))}
          type="button"
        >
          <img
            alt={toImageMeta(image)}
            className="h-full w-full object-cover"
            loading="lazy"
            src={refImageUrl(task, refId, image)}
          />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill border border-border bg-subtle px-3 py-1 text-2xs font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-muted">
            {image.source}
          </span>
          <span className="font-mono text-xs text-muted">{image.key}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_120px]">
          <Field>
            <Label>Role</Label>
            <Select
              disabled={readonly || isBusy}
              options={ROLE_OPTIONS}
              value={draft.role}
              onChange={(event) => onDraftChange('role', event.currentTarget.value)}
            />
          </Field>
          <Field>
            <Label>Style</Label>
            <input
              className={controlClass}
              disabled={readonly || isBusy}
              value={draft.style}
              onChange={(event) => onDraftChange('style', event.currentTarget.value)}
            />
          </Field>
          <Field>
            <Label>Order</Label>
            <input
              className={controlClass}
              disabled={readonly || isBusy}
              inputMode="numeric"
              min={0}
              type="number"
              value={draft.orderIndex}
              onChange={(event) => onDraftChange('orderIndex', event.currentTarget.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex gap-2">
            <Button
              disabled={readonly || isBusy}
              size="sm"
              variant="secondary"
              onClick={() => void onNudge(-1)}
            >
              Up
            </Button>
            <Button
              disabled={readonly || isBusy}
              size="sm"
              variant="secondary"
              onClick={() => void onNudge(1)}
            >
              Down
            </Button>
          </div>
          <div className="flex gap-2">
            {readonly ? (
              <HelperText>Baseline image is read-only.</HelperText>
            ) : (
              <>
                <Button disabled={isBusy} size="sm" variant="secondary" onClick={onSave}>
                  {isBusy ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  disabled={isBusy}
                  size="sm"
                  variant="danger"
                  onClick={() => void onDelete(image)}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="m-0 rounded-md border border-danger bg-subtle px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}

function createDrafts(images: RefImage[]) {
  return Object.fromEntries(images.map((image) => [image.key, createImageDraft(image)]));
}

function createImageDraft(image: RefImage): ImageDraft {
  return {
    orderIndex: String(image.order_index),
    role: image.role,
    style: image.style ?? '',
  };
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function parseOrderIndex(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function patchDraft(
  setDrafts: Dispatch<SetStateAction<Record<string, ImageDraft>>>,
  key: string,
  field: keyof ImageDraft,
  value: ImageDraft[keyof ImageDraft]
) {
  setDrafts((current) => ({
    ...current,
    [key]: {
      ...(current[key] ?? { orderIndex: '0', role: 'variant', style: '' }),
      [field]: value,
    },
  }));
}

function resetUploadForm(
  setUploadFile: Dispatch<SetStateAction<File | null>>,
  setUploadRole: Dispatch<SetStateAction<RefImageRole>>,
  setUploadStyle: Dispatch<SetStateAction<string>>,
  setUploadOrderIndex: Dispatch<SetStateAction<string>>
) {
  setUploadFile(null);
  setUploadRole('variant');
  setUploadStyle('');
  setUploadOrderIndex('0');
}
