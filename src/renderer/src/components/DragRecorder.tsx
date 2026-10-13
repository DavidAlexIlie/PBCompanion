import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

/**
 * Dev tool: records a real, hand-made drag of the demo token (#100) across the
 * board, so the tutorial can replay that natural motion instead of a robotic
 * tween. Points are stored normalised to the board rect, so replay adapts to
 * any window size. Saved to <dataDir>/tutorial-drag.json via the main process.
 */
interface RecPoint {
  nx: number
  ny: number
  t: number
}

function boardRect(): { left: number; top: number; w: number; h: number } | null {
  const cols = [...document.querySelectorAll('[data-tour="board-col"]')]
  if (cols.length < 3) return null
  const rs = cols.map((c) => c.getBoundingClientRect())
  const left = Math.min(...rs.map((r) => r.left))
  const top = Math.min(...rs.map((r) => r.top))
  const right = Math.max(...rs.map((r) => r.right))
  const bottom = Math.max(...rs.map((r) => r.bottom))
  return { left, top, w: right - left, h: bottom - top }
}

export default function DragRecorder(): JSX.Element | null {
  const { recordingDrag, setRecordingDrag, setRoute, setShowWebview, setWebviewFull, refresh } =
    useStore()
  const [status, setStatus] = useState('Se pregătește...')
  const points = useRef<RecPoint[]>([])
  const t0 = useRef(0)
  const dragging = useRef(false)

  useEffect(() => {
    if (!recordingDrag) return
    setShowWebview(false)
    setWebviewFull(false)
    setStatus('Se pregătește...')
    void window.api.tutorialStart().then(() => {
      refresh()
      setRoute('board')
      setStatus('Trage problema #100 în Completed.')
    })

    const finishAndClose = (): void => {
      void window.api.tutorialEnd().then(() => refresh())
      setRecordingDrag(false)
    }

    const onDown = (e: PointerEvent): void => {
      // Only start if the press lands on the #100 token.
      const onToken = (e.target as HTMLElement | null)?.closest('[data-token-id="100"]')
      if (!onToken) return
      dragging.current = true
      points.current = []
      t0.current = performance.now()
      record(e)
    }
    const record = (e: PointerEvent): void => {
      const b = boardRect()
      if (!b) return
      points.current.push({
        nx: (e.clientX - b.left) / b.w,
        ny: (e.clientY - b.top) / b.h,
        t: Math.round(performance.now() - t0.current)
      })
    }
    const onMove = (e: PointerEvent): void => {
      if (dragging.current) record(e)
    }
    const onUp = (e: PointerEvent): void => {
      if (!dragging.current) return
      dragging.current = false
      record(e)
      if (points.current.length < 3) {
        setStatus('Prea scurt — încearcă din nou.')
        return
      }
      void window.api.saveDragRecording(JSON.stringify({ points: points.current }))
      setStatus(`Salvat! (${points.current.length} puncte)`)
      setTimeout(finishAndClose, 1300)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finishAndClose()
    }

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [recordingDrag])

  if (!recordingDrag) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center p-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-brand-200 bg-white px-4 py-2 text-sm shadow-2xl">
        <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
        <span className="font-semibold text-slate-700">REC · {status}</span>
        <button
          onClick={() => {
            void window.api.tutorialEnd().then(() => refresh())
            setRecordingDrag(false)
          }}
          className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
        >
          Esc
        </button>
      </div>
    </div>
  )
}
