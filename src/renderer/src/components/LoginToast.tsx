import { useEffect, useState } from 'react'
import { IconCheckMark, IconBrowser } from './icons'

/**
 * Shown after the user logs in on pbinfo inside the app: offer to remember that
 * login on this machine. The secret stays in the main process and is only
 * written (encrypted) if the user clicks Save — this UI only ever sees the
 * username.
 *
 * Carries `data-pbinfo-overlay`: the pbinfo browser is a native layer painted
 * ABOVE this React DOM, so App.tsx hides it while an overlay is present. We
 * then blur the app underneath and centre the dialog, instead of a card tucked
 * behind the webview. Colours come from theme CSS variables, so it follows
 * light/dark automatically.
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

  // Confirmations close on their own; the offer waits for a choice.
  useEffect(() => {
    if (toast?.kind !== 'saved') return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null

  return (
    <div
      data-pbinfo-overlay
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-500/20 p-6 backdrop-blur-md"
    >
      <div className="w-[26rem] max-w-[92vw] animate-pop-in rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        {toast.kind === 'saved' ? (
          <div className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <IconCheckMark className="h-6 w-6" />
            </span>
            <div className="mt-3 text-base font-bold text-slate-900">
              {toast.updated ? 'Saved login updated' : 'Login saved'}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Stored encrypted on this PC for{' '}
              <span className="font-semibold text-slate-700">{toast.user}</span>. It will fill in
              automatically next time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <IconBrowser className="h-6 w-6" />
            </span>
            <h2 className="mt-3 text-lg font-bold text-slate-900">Save this login?</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Remember <span className="font-semibold text-slate-700">{toast.user}</span> on this PC
              and fill it in next time. Stored encrypted, locally — never uploaded or synced.
            </p>
            <div className="mt-5 flex w-full gap-2.5">
              <button
                onClick={async () => {
                  await window.api.dismissLoginOffer()
                  setToast(null)
                }}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Not now
              </button>
              <button
                onClick={() => void window.api.confirmSaveLogin()}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-soft hover:bg-brand-700"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
