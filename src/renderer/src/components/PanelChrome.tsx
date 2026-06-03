import { IconClose } from './icons'

/**
 * Frameless panel shell. The thin top strip is the only drag region (so the
 * window can be moved anywhere / to another screen) — there is no OS title bar
 * or app header. The content fills the rest.
 *
 * `-webkit-app-region: drag` makes the strip draggable; interactive controls
 * opt out with `no-drag`.
 */
export default function PanelChrome({
  title,
  toolbar,
  children
}: {
  title: string
  toolbar?: JSX.Element
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <div
        className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="px-1 text-xs font-semibold text-slate-500">{title}</span>
        <div
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {toolbar}
          <button
            onClick={() => window.close()}
            title="Close"
            className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
