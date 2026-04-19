import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, ErrorText, HelperText } from '../../components/ui';
import { api } from '../../lib/api';
import { describeError, parseRunCreateResponse } from '../generate/utils';
import { useReuse } from './useReuse';

type ActionsMenuProps = {
  onDeleteSuccess: () => void;
  runId: string;
  status: string;
};

export function ActionsMenu({
  onDeleteSuccess,
  runId,
  status,
}: ActionsMenuProps) {
  const navigate = useNavigate();
  const { error: reuseError, isLoading: isReusing, reuse } = useReuse(runId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const canResume = status === 'paused';

  async function handleResume() {
    setIsResuming(true);
    setActionError(null);
    try {
      const payload = parseRunCreateResponse(await api.runs.resume(runId));
      navigate(`/history/${payload.runId}`);
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setIsResuming(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setActionError(null);
    try {
      await api.runs.delete(runId);
      setIsDeleteOpen(false);
      onDeleteSuccess();
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isReusing} variant="secondary" onClick={() => void reuse()}>
          {isReusing ? 'Reusing...' : 'Reuse'}
        </Button>
        <Button
          disabled={!canResume || isResuming}
          variant="ghost"
          onClick={() => void handleResume()}
        >
          {isResuming ? 'Resuming...' : 'Resume'}
        </Button>
        <Button variant="danger" onClick={() => setIsDeleteOpen(true)}>
          Delete
        </Button>
      </div>
      {!canResume ? (
        <HelperText>Resume is available only for paused runs.</HelperText>
      ) : null}
      {reuseError ? <ErrorText>{reuseError}</ErrorText> : null}
      {actionError ? <ErrorText>{actionError}</ErrorText> : null}
      <Dialog
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete run'}
        description="Deleting a run also removes stored stages and image files from disk."
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        open={isDeleteOpen}
        title="Delete this run?"
      />
    </>
  );
}
