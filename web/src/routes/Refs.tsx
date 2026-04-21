import { useEffect, useRef, useState } from 'react';
import {
  createRef,
  deleteRef as deleteRefRow,
  deleteRefImage,
  listRefs,
  type RefCreateBody,
  type RefImage,
  type RefImageUpdateBody,
  type RefImageUploadBody,
  type RefRow,
  type RefTask,
  updateRef,
  updateRefImage,
  uploadRefImage,
} from '../api/refs';
import { RefEditor } from '../components/refs/RefEditor';
import { RefImageManager } from '../components/refs/RefImageManager';
import { RefList } from '../components/refs/RefList';
import { describeRefsError, REF_TASK_LABELS, sortRefs } from '../components/refs/constants';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Tag } from '../components/ui/Tag';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
type RefCollections = Record<RefTask, RefRow[]>;
type RefTarget = { id?: string; task: RefTask };

const EMPTY_REFS: RefCollections = { diagram: [], plot: [] };

export default function RefsRoute() {
  const [activeTask, setActiveTask] = useState<RefTask>('diagram');
  const [rowsByTask, setRowsByTask] = useState<RefCollections>(EMPTY_REFS);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle');
  const [loadError, setLoadError] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editorTarget, setEditorTarget] = useState<RefTarget | null>(null);
  const [imageTarget, setImageTarget] = useState<RefTarget | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void refreshRefs();
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!imageTarget || findTargetRow(rowsByTask, imageTarget)) return;
    setImageTarget(null);
  }, [imageTarget, rowsByTask]);

  async function refreshRefs(background = false) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (background) setIsRefreshing(true);
    else setLoadStatus('loading');
    try {
      const [diagram, plot] = await Promise.all([
        listRefs('diagram', { signal: controller.signal }),
        listRefs('plot', { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      setRowsByTask({ diagram: sortRefs(diagram), plot: sortRefs(plot) });
      setLoadStatus('ready');
      setLoadError('');
      setPageError(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = describeRefsError(error);
      if (background && hasAnyRows(rowsByTask)) setPageError(message);
      else {
        setLoadStatus('error');
        setLoadError(message);
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (background) setIsRefreshing(false);
    }
  }

  async function persistRef(target: RefTarget, payload: RefCreateBody) {
    if (target.id) await updateRef(target.task, target.id, payload);
    else await createRef(target.task, payload);
    await refreshRefs(true);
  }

  async function handleDelete(task: RefTask, row: RefRow) {
    const confirmed = window.confirm(`删除条目 “${row.id}” 后无法恢复，继续吗？`);
    if (!confirmed) return;
    try {
      await deleteRefRow(task, row.id);
      await refreshRefs(true);
    } catch (error) {
      setPageError(describeRefsError(error));
    }
  }
  const editorRow = findTargetRow(rowsByTask, editorTarget);
  const imageRow = findTargetRow(rowsByTask, imageTarget);

  return (
    <div className="space-y-6">
      <PageHeader
        isRefreshing={isRefreshing}
        onCreate={() => setEditorTarget({ task: activeTask })}
      />

      {pageError ? <PageErrorBanner message={pageError} /> : null}
      {loadStatus === 'idle' || loadStatus === 'loading' ? <LoadingState /> : null}
      {loadStatus === 'error' ? (
        <RetryState detail={loadError} onRetry={() => void refreshRefs()} />
      ) : null}
      {loadStatus === 'ready' ? (
        <Tabs
          activeKey={activeTask}
          items={buildTabItems(rowsByTask, activeTask, {
            onDelete: handleDelete,
            onEdit: (task, row) => setEditorTarget({ id: row.id, task }),
            onManageImages: (task, row) => setImageTarget({ id: row.id, task }),
          })}
          onChange={(key) => setActiveTask(key as RefTask)}
        />
      ) : null}

      <RefEditor
        key={editorTarget ? `${editorTarget.task}:${editorTarget.id ?? 'new'}` : 'closed'}
        open={Boolean(editorTarget)}
        row={editorRow}
        task={editorTarget?.task ?? activeTask}
        onClose={() => setEditorTarget(null)}
        onSave={(payload) => persistRef(editorTarget ?? { task: activeTask }, payload)}
      />

      <RefImageManager
        open={Boolean(imageTarget)}
        row={imageRow}
        task={imageTarget?.task ?? activeTask}
        onClose={() => setImageTarget(null)}
        onDeleteImage={(image) =>
          mutateImage(imageTarget, async (target) => {
            await deleteRefImage(target.task, target.id, image.key);
            await refreshRefs(true);
          })
        }
        onUpdateImage={(key, patch) =>
          mutateImage(imageTarget, async (target) => {
            await updateRefImage(target.task, target.id, key, patch);
            await refreshRefs(true);
          })
        }
        onUploadImage={(file, payload) =>
          mutateImage(imageTarget, async (target) => {
            await uploadRefImage(target.task, target.id, file, payload);
            await refreshRefs(true);
          })
        }
      />
    </div>
  );
}

type PageHeaderProps = {
  isRefreshing: boolean;
  onCreate: () => void;
};

function PageHeader({ isRefreshing, onCreate }: PageHeaderProps) {
  return (
    <section className="rounded-lg border border-border bg-surface px-6 py-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Tag tone="ok">Refs</Tag>
          <div>
            <h1 className="m-0 text-2xl font-semibold text-primary">示例候选池 / Refs</h1>
            <p className="m-0 text-sm text-secondary">
              管理 diagram / plot 的 baseline 与 overlay 参考条目，支持多图与 style 标签。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isRefreshing ? <span className="text-xs text-muted">Refreshing…</span> : null}
          <Button onClick={onCreate}>新建条目 / New ref</Button>
        </div>
      </div>
    </section>
  );
}

function PageErrorBanner({ message }: { message: string }) {
  return (
    <p className="m-0 rounded-lg border border-danger bg-subtle px-4 py-3 text-sm text-danger">
      {message}
    </p>
  );
}

function LoadingState() {
  return (
    <section className="rounded-lg border border-border bg-subtle px-6 py-8">
      <p className="m-0 text-sm text-secondary">加载 refs 中 / Loading refs...</p>
    </section>
  );
}

type RetryStateProps = {
  detail: string;
  onRetry: () => void;
};

function RetryState({ detail, onRetry }: RetryStateProps) {
  return (
    <section className="rounded-lg border border-danger bg-subtle px-6 py-8" role="alert">
      <p className="m-0 text-sm font-medium text-danger">加载 refs 失败 / Failed to load refs</p>
      <p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-danger">{detail}</p>
      <Button className="mt-4" variant="secondary" onClick={onRetry}>
        重试 / Retry
      </Button>
    </section>
  );
}

type RefListActions = {
  onDelete: (task: RefTask, row: RefRow) => void;
  onEdit: (task: RefTask, row: RefRow) => void;
  onManageImages: (task: RefTask, row: RefRow) => void;
};

function buildTabItems(rowsByTask: RefCollections, activeTask: RefTask, actions: RefListActions) {
  return (Object.keys(rowsByTask) as RefTask[]).map((task) => ({
    content: (
      <RefList
        refs={rowsByTask[task]}
        task={task}
        onDelete={actions.onDelete}
        onEdit={actions.onEdit}
        onManageImages={actions.onManageImages}
      />
    ),
    key: task,
    label: REF_TASK_LABELS[task],
    meta: `(${rowsByTask[task].length})`,
  }));
}

async function mutateImage(
  target: RefTarget | null,
  mutate: (target: { id: string; task: RefTask }) => Promise<void>
) {
  if (!target?.id) throw new Error('请选择一个已有条目后再管理图片');
  await mutate({ id: target.id, task: target.task });
}

function findTargetRow(rowsByTask: RefCollections, target: RefTarget | null) {
  if (!target?.id) return null;
  return rowsByTask[target.task].find((row) => row.id === target.id) ?? null;
}

function hasAnyRows(rowsByTask: RefCollections) {
  return rowsByTask.diagram.length > 0 || rowsByTask.plot.length > 0;
}
