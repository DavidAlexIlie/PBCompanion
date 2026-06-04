import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  icon?: JSX.Element
}

/** A small floating menu positioned at (x, y) in viewport coordinates. */
export default function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // Keep the menu inside the viewport.
  const left = Math.min(x, window.innerWidth - 220)
  const top = Math.min(y, window.innerHeight - (items.length * 40 + 12))

  return (
    <div
      ref={ref}
      data-pbinfo-overlay
      style={{ left, top }}
      className="fixed z-[60] min-w-[180px] animate-pop-in rounded-xl border border-slate-200 bg-white p-1.5 shadow-lift"
    >
      {items.map((it, i) => (
        <button
          key={i}
          onClick={() => {
            it.onClick()
            onClose()
          }}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
            it.danger
              ? 'text-rose-600 hover:bg-rose-50'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  )
}
