import { useState } from 'react'
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
 * A draggable vertical divider. On pointer-down it captures a baseline (via
 * `onStart`) and then reports the TOTAL horizontal delta from that point via
 * `onResize`. Reporting the total (not per-move increments) avoids stale-state
 * bugs and makes resizing track the cursor exactly.
 *
 * While dragging we flag global resize so the overlaid webview is suppressed
 * and can't swallow pointer events.
 */
export default function Splitter({
  onStart,
  onResize
}: {
  onStart?: () => void
  onResize: (totalDx: number) => void
}): JSX.Element {
  const setResizing = useStore((s) => s.setResizing)

  const onPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    onStart?.()
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (ev: PointerEvent): void => onResize(ev.clientX - startX)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className="group/split relative z-30 flex w-2.5 shrink-0 cursor-col-resize items-stretch justify-center"
    >
      <div className="my-2 w-0.5 rounded bg-slate-200 transition-colors group-hover/split:bg-brand-400" />
    </div>
  )
}
