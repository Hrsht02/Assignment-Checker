import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  open, onClose, onConfirm,
  title, message, confirmLabel = 'Confirm',
  danger = false, loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-gray-600">{message}</p>
      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading && <Spinner className="h-4 w-4" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
