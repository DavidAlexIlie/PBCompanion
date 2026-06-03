import { useEffect, useState } from 'react'
import { useStore } from '../store'

/** A persisted numeric layout size backed by localStorage. */
export function usePersistentNumber(key: string, initial: number): [number, (n: number) => void] {
  const [v, setV] = useState<number>(() => {
    const s = localStorage.getItem(key)
    const n = s == null ? NaN : Number(s)
    return Number.isFinite(n) ? n : initial
  })
  const set = (n: number): void => {
    setV(n)
    localStorage.setItem(key, String(n))
  }
  return [v, set]
}

export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n))

/**
 * A draggable vertical divider. Hovering shows a resize cursor + blue tint;
 * dragging reports the horizontal delta. While dragging we flag global resize
 * so the overlaid webview is suppressed and can't swallow pointer events.
 */
export default function Splitter({ onDrag }: { onDrag: (dx: number) => void }): JSX.Element {
  const setResizing = useStore((s) => s.setResizing)

  const onPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    let last = e.clientX
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - last
      last = ev.clientX
      if (dx !== 0) onDrag(dx)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      setResizing(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className="group/split relative z-20 flex w-2 shrink-0 cursor-col-resize items-stretch justify-center"
    >
      <div className="my-2 w-px bg-slate-200 transition-colors group-hover/split:w-0.5 group-hover/split:bg-brand-400" />
    </div>
  )
}

// Re-export to satisfy callers that only need the cleanup of body cursor on unmount.
export function useResetCursorOnUnmount(): void {
  useEffect(() => () => void (document.body.style.cursor = ''), [])
}
