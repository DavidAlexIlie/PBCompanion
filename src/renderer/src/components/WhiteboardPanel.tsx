import { useEffect, useRef, useState } from 'react'
import PanelChrome from './PanelChrome'
import { IconTrash } from './icons'

interface Point {
  x: number
  y: number
}
interface Stroke {
  color: string
  width: number
  erase: boolean
  points: Point[]
}

const COLORS = ['#0f172a', '#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']
const SIZES = [2, 4, 8, 14]

/**
 * A simple but smooth whiteboard. Strokes are stored as point lists and drawn
 * with quadratic-curve smoothing on a device-pixel-ratio-scaled canvas, so
 * lines are continuous and crisp rather than pixelated/jagged.
 *
 * - Undo (Ctrl+Z) removes the last stroke; the full stroke list is kept, so the
 *   undo depth is effectively unlimited (well beyond 15).
 * - Autosaves every second, on each finished stroke, and on close.
 */
export default function WhiteboardPanel({ problemId }: { problemId: number }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const strokes = useRef<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const dpr = useRef(window.devicePixelRatio || 1)

  const [color, setColor] = useState(COLORS[1])
  const [size, setSize] = useState(SIZES[1])
  const [erase, setErase] = useState(false)

  const colorRef = useRef(color)
  const sizeRef = useRef(size)
  const eraseRef = useRef(erase)
  colorRef.current = color
  sizeRef.current = size
  eraseRef.current = erase

  // --- rendering ---------------------------------------------------------
  const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke): void => {
    const pts = s.points
    if (pts.length === 0) return
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    ctx.beginPath()
    if (pts.length < 3) {
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      // a single dot
      if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.fill()
      }
    } else {
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length - 1; i++) {
        const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 }
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y)
      }
      ctx.quadraticCurveTo(
        pts[pts.length - 2].x,
        pts[pts.length - 2].y,
        pts[pts.length - 1].x,
        pts[pts.length - 1].y
      )
    }
    ctx.stroke()
    ctx.restore()
  }

  const redraw = (): void => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.setTransform(dpr.current, 0, 0, dpr.current, 0, 0)
    ctx.clearRect(0, 0, c.width / dpr.current, c.height / dpr.current)
    for (const s of strokes.current) drawStroke(ctx, s)
    if (current.current) drawStroke(ctx, current.current)
  }

  const resize = (): void => {
    const c = canvasRef.current
    const wrap = wrapRef.current
    if (!c || !wrap) return
    dpr.current = window.devicePixelRatio || 1
    c.width = Math.floor(wrap.clientWidth * dpr.current)
    c.height = Math.floor(wrap.clientHeight * dpr.current)
    c.style.width = `${wrap.clientWidth}px`
    c.style.height = `${wrap.clientHeight}px`
    redraw()
  }

  // --- load + autosave ---------------------------------------------------
  useEffect(() => {
    window.api.getDoc(problemId).then((d) => {
      try {
        const parsed = d.whiteboard ? (JSON.parse(d.whiteboard) as { strokes: Stroke[] }) : null
        strokes.current = parsed?.strokes ?? []
      } catch {
        strokes.current = []
      }
      redraw()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId])

  useEffect(() => {
    resize()
    const ro = new ResizeObserver(resize)
    if (wrapRef.current) ro.observe(wrapRef.current)
    window.addEventListener('resize', resize)

    const save = (): void => {
      if (!dirty.current) return
      dirty.current = false
      void window.api.saveWhiteboard(problemId, JSON.stringify({ strokes: strokes.current }))
    }
    const interval = setInterval(save, 1000)
    const flush = (): void => save()
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)

    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (strokes.current.length > 0) {
          strokes.current.pop()
          dirty.current = true
          redraw()
        }
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('keydown', onKey)
      clearInterval(interval)
      save()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId])

  // --- pointer drawing ---------------------------------------------------
  const pos = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onDown = (e: React.PointerEvent): void => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drawing.current = true
    current.current = {
      color: colorRef.current,
      width: sizeRef.current,
      erase: eraseRef.current,
      points: [pos(e)]
    }
    redraw()
  }
  const onMove = (e: React.PointerEvent): void => {
    if (!drawing.current || !current.current) return
    // Coalesced events give smoother, denser sampling for continuous lines.
    const events = (e.nativeEvent.getCoalescedEvents?.() ?? []) as PointerEvent[]
    const r = canvasRef.current!.getBoundingClientRect()
    if (events.length) {
      for (const ev of events) current.current.points.push({ x: ev.clientX - r.left, y: ev.clientY - r.top })
    } else {
      current.current.points.push(pos(e))
    }
    requestAnimationFrame(redraw)
  }
  const onUp = (): void => {
    if (!drawing.current) return
    drawing.current = false
    if (current.current && current.current.points.length) {
      strokes.current.push(current.current)
      dirty.current = true
    }
    current.current = null
    redraw()
  }

  const clearAll = (): void => {
    strokes.current = []
    dirty.current = true
    redraw()
  }

  const toolbar = (
    <div className="flex items-center gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => {
            setColor(c)
            setErase(false)
          }}
          className={`h-4 w-4 rounded-full ring-1 ring-offset-1 transition ${
            color === c && !erase ? 'ring-slate-500' : 'ring-transparent'
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <span className="mx-0.5 h-4 w-px bg-slate-300" />
      {SIZES.map((s) => (
        <button
          key={s}
          onClick={() => setSize(s)}
          className={`flex h-6 w-6 items-center justify-center rounded transition ${
            size === s ? 'bg-slate-200' : 'hover:bg-slate-100'
          }`}
        >
          <span className="rounded-full bg-slate-700" style={{ width: s + 2, height: s + 2 }} />
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-slate-300" />
      <button
        onClick={() => setErase((v) => !v)}
        title="Eraser"
        className={`rounded px-2 py-1 text-xs font-semibold transition ${
          erase ? 'bg-amber-200 text-amber-800' : 'text-slate-500 hover:bg-slate-100'
        }`}
      >
        Erase
      </button>
      <button
        onClick={clearAll}
        title="Clear"
        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600"
      >
        <IconTrash className="h-4 w-4" />
      </button>
    </div>
  )

  return (
    <PanelChrome title={`Whiteboard · #${problemId}`} toolbar={toolbar}>
      <div ref={wrapRef} className="relative h-full w-full bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="block h-full w-full touch-none"
          style={{ cursor: erase ? 'cell' : 'crosshair' }}
        />
      </div>
    </PanelChrome>
  )
}
