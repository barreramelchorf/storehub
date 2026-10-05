'use client'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * App-wide confirmation modal. Replaces the browser's native confirm() so
 * destructive actions use a consistent, themed dialog.
 */
export function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  danger = true, loading = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[var(--color-text-dark)] mb-1">{title}</h2>
        <p className="text-sm text-[var(--color-text)] mb-4">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${danger ? 'bg-red-500' : 'bg-[var(--color-primary)]'}`}
          >
            {loading ? '...' : confirmLabel}
          </button>
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-dark)] hover:bg-[var(--color-surface)] transition-colors">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
