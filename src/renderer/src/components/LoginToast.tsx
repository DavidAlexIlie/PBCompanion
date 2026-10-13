import { useEffect, useState } from 'react'
import { IconClose, IconCheckMark } from './icons'

/**
 * A Google-style, non-blocking prompt: after the user logs in on pbinfo inside
 * the app, offer to remember that login on this machine. The secret is held in
 * the main process and only written (encrypted) if the user clicks Save — this
 * UI only ever sees the username.
 */
type Toast =
  | { kind: 'offer'; user: string }
  | { kind: 'saved'; user: string; updated: boolean }

export default function LoginToast(): JSX.Element | null {
  const [toast, setToast] = useState<Toast | null>(null)

  useEffect(() => {
    const offOffer = window.api.onLoginOffer(({ user }) => setToast({ kind: 'offer', user }))
    const offSaved = window.api.onLoginSaved(({ user, updated }) =>
      setToast({ kind: 'saved', user, updated })
    )
    return () => {
      offOffer()
      offSaved()
    }
  }, [])

  // Confirmations fade on their own; the offer waits for a choice.
  useEffect(() => {
    if (toast?.kind !== 'saved') return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null

  if (toast.kind === 'saved') {
    return (
      <Shell>
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <IconCheckMark className="h-4 w-4" />
          </span>
          <div className="text-sm text-slate-700">
            {toast.updated ? 'Saved login updated' : 'Login saved'} on this PC for{' '}
            <span className="font-semibold">{toast.user}</span>.
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">Remember this login?</div>
          <p className="mt-0.5 text-xs text-slate-500">
            Save <span className="font-semibold text-slate-700">{toast.user}</span> on this PC and
            fill it in next time. Stored encrypted, locally — never uploaded.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                await window.api.confirmSaveLogin()
                // The 'login:saved' event swaps this to the confirmation.
              }}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
            >
              Save
            </button>
            <button
              onClick={async () => {
                await window.api.dismissLoginOffer()
                setToast(null)
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={async () => {
            await window.api.dismissLoginOffer()
            setToast(null)
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="fixed bottom-5 right-5 z-[60] w-80 animate-pop-in rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
      {children}
    </div>
  )
}
