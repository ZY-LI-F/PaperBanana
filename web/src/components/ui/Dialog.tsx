import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

type DialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: ReactNode;
};

export function Dialog({
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: DialogProps) {
  return (
    <Modal
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
      onClose={onCancel}
      open={open}
      size="sm"
      title={title}
    >
      <p className="m-0 text-sm text-secondary">This dialog is ready for destructive or irreversible workflow actions.</p>
    </Modal>
  );
}
