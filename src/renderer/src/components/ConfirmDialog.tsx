/** An app-styled confirmation dialog (replaces the native confirm()). */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onCancel
}: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/30"
      onMouseDown={onCancel}
    >
      <div
        className="w-[380px] max-w-[90vw] animate-pop-in rounded-2xl bg-white p-6 shadow-lift"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
