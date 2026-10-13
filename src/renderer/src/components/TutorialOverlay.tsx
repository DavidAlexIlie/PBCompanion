import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { TOUR, TOUR_DONE_KEY, type TourPhase } from '../lib/tour'

/**
 * Light, step-by-step onboarding. The current target(s) are cut out of a dimmed
 * layer (box-shadow spotlight) and a small card sits beside them. Everything is
 * measured from live getBoundingClientRect, so it tracks window size and
 * layout. App-DOM steps carry data-pbinfo-overlay (the native pbinfo view
 * hides); the "read the statement" step keeps it visible and spotlights it.
 */
const CARD_W = 300

const MOCK_PROBLEM = {
  id: 100,
  slug: 'nrapprime',
  title: 'Al N-lea prim',
  url: 'https://www.pbinfo.ro/probleme/100/nrapprime',
  statementHtml: null
}
const EMPTY_CODE = `#include <iostream>
using namespace std;

int main() {

    return 0;
}
`
const DEMO_CODE = `#include <iostream>
using namespace std;

bool prim(int x) {
    if (x < 2) return false;
    for (int d = 2; d * d <= x; d++)
        if (x % d == 0) return false;
    return true;
}

int main() {
    int n;
    cin >> n;
    cout << prim(n);
    return 0;
}
`


export default function TutorialOverlay(): JSX.Element | null {
  const s = useStore()
  const { tour, startTour, stopTour } = s
  const [si, setSi] = useState(0)
  const [pi, setPi] = useState(0)
  const [box, setBox] = useState<DOMRect | null>(null)
  const ranAction = useRef<string>('')
  const typeTimer = useRef<ReturnType<typeof setInterval>>()
  const rafRef = useRef<number>()
  const cloneRef = useRef<HTMLElement | null>(null)

  // Auto-start on first run.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_DONE_KEY)) {
        const t = setTimeout(startTour, 600)
        return () => clearTimeout(t)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Starting the tour: reset and spin up the demo data.
  useEffect(() => {
    if (!tour) return
    setSi(0)
    setPi(0)
    ranAction.current = ''
    void window.api.tutorialStart().then(() => s.refresh())
  }, [tour])

  const stage = tour ? TOUR[si] : null
  const phase: TourPhase | null = stage ? stage.phases[pi] : null

  // Apply route / webview / one-shot action on entering a phase.
  useEffect(() => {
    if (!phase) return
    if (phase.route) s.setRoute(phase.route)
    // Close pbinfo (and un-maximise) whenever we leave the workspace demo, so
    // the board / groups / settings show at their usual sizes.
    if (phase.route && phase.route !== 'workspace' && !phase.showWebview) {
      s.setShowWebview(false)
      s.setWebviewFull(false)
    }
    const key = `${si}.${pi}`
    if (phase.action && ranAction.current !== key) {
      ranAction.current = key
      runAction(phase.action)
    }
  }, [si, pi, tour])

  const runAction = (action: NonNullable<TourPhase['action']>): void => {
    if (action === 'open-problem') {
      s.setDetected(MOCK_PROBLEM)
      s.setTourCode(EMPTY_CODE)
      void window.api.navigatePbinfo(MOCK_PROBLEM.url)
    } else if (action === 'type-code') {
      if (typeTimer.current) clearInterval(typeTimer.current)
      let k = 0
      s.setTourCode('')
      typeTimer.current = setInterval(() => {
        k++
        s.setTourCode(DEMO_CODE.slice(0, k))
        if (k >= DEMO_CODE.length && typeTimer.current) {
          clearInterval(typeTimer.current)
          typeTimer.current = undefined
        }
      }, 16)
    } else if (action === 'move-token') {
      // Let the lane spotlight settle before the token starts moving.
      setTimeout(() => void replayDrag(), 1500)
    }
  }

  // Replay the hand-recorded drag of #100 into Completed, then commit. Retries
  // until the board (which just reflowed after pbinfo closed) has painted the
  // token. Falls back to a straight move if there is no recording.
  const replayDrag = async (attempt = 0): Promise<void> => {
    const commit = (): void => void window.api.setProblemStatus(100, 'completed').then(() => s.refresh())
    const token = document.querySelector('[data-token-id="100"]') as HTMLElement | null
    const cols = [...document.querySelectorAll('[data-tour="board-col"]')]
    if ((!token || cols.length < 3) && attempt < 14) {
      setTimeout(() => void replayDrag(attempt + 1), 150)
      return
    }
    if (!token || cols.length < 3) return commit()

    const raw = await window.api.getDragRecording()
    const rs = cols.map((c) => c.getBoundingClientRect())
    const left = Math.min(...rs.map((r) => r.left))
    const top = Math.min(...rs.map((r) => r.top))
    const bw = Math.max(...rs.map((r) => r.right)) - left
    const bh = Math.max(...rs.map((r) => r.bottom)) - top
    const tr = token.getBoundingClientRect()

    let pts: { nx: number; ny: number; t: number }[] = []
    try {
      pts = raw ? (JSON.parse(raw).points ?? []) : []
    } catch {
      pts = []
    }
    // No recording → a simple straight move as a fallback.
    if (pts.length < 2) {
      const dst = rs[1]
      pts = [
        { nx: (tr.left + tr.width / 2 - left) / bw, ny: (tr.top + tr.height / 2 - top) / bh, t: 0 },
        { nx: (dst.left + 30 - left) / bw, ny: (dst.top + 60 - top) / bh, t: 1200 }
      ]
    }

    // Clone the real token node so the moving piece is pixel-identical (same
    // dome, same size) — no separate styled box that could look bigger/smaller.
    const clone = token.cloneNode(true) as HTMLElement
    clone.style.position = 'fixed'
    clone.style.margin = '0'
    clone.style.width = `${tr.width}px`
    clone.style.height = `${tr.height}px`
    clone.style.pointerEvents = 'none'
    clone.style.zIndex = '80'
    clone.style.transition = 'none'
    document.body.appendChild(clone)
    cloneRef.current = clone
    token.style.visibility = 'hidden'

    const at = (p: { nx: number; ny: number }): { x: number; y: number } => ({
      x: left + p.nx * bw,
      y: top + p.ny * bh
    })
    const place = (p: { nx: number; ny: number }): void => {
      const { x, y } = at(p)
      clone.style.left = `${x - tr.width / 2}px`
      clone.style.top = `${y - tr.height / 2}px`
    }
    place(pts[0])

    const total = pts[pts.length - 1].t || 1
    const start = performance.now()
    const step = (now: number): void => {
      const el = now - start
      let p = pts[pts.length - 1]
      for (let i = 0; i < pts.length; i++)
        if (pts[i].t >= el) {
          p = pts[i]
          break
        }
      place(p)
      if (el < total) rafRef.current = requestAnimationFrame(step)
      else {
        clone.remove()
        cloneRef.current = null
        commit()
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  // Measure target(s); keep current on resize / layout settle.
  useLayoutEffect(() => {
    if (!phase) return
    const measure = (): void => {
      if (!phase.targets || phase.targets.length === 0) return setBox(null)
      const rects = phase.targets
        .flatMap((sel) => [...document.querySelectorAll(sel)])
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
      if (rects.length === 0) return setBox(null)
      const left = Math.min(...rects.map((r) => r.left))
      const top = Math.min(...rects.map((r) => r.top))
      const right = Math.max(...rects.map((r) => r.right))
      const bottom = Math.max(...rects.map((r) => r.bottom))
      setBox(new DOMRect(left, top, right - left, bottom - top))
    }
    measure()
    const settle = setTimeout(measure, 140)
    window.addEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    ro.observe(document.documentElement)
    return () => {
      clearTimeout(settle)
      window.removeEventListener('resize', measure)
      ro.disconnect()
    }
  }, [si, pi, tour])

  useEffect(
    () => () => {
      if (typeTimer.current) clearInterval(typeTimer.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (cloneRef.current) cloneRef.current.remove()
    },
    []
  )

  if (!stage || !phase) return null

  const stageCount = TOUR.length
  const atEnd = si === stageCount - 1 && pi === stage.phases.length - 1
  const atStart = si === 0 && pi === 0
  const lastPhase = pi === stage.phases.length - 1

  const finish = (): void => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1')
    } catch {
      /* ignore */
    }
    if (typeTimer.current) clearInterval(typeTimer.current)
    void window.api.tutorialEnd().then(() => s.refresh())
    s.setTourCode(null)
    s.setDetected(null)
    s.setShowWebview(false)
    s.setWebviewFull(false)
    s.setRoute('home')
    // Send the (hidden) pbinfo browser back to its home page.
    void window.api.navigatePbinfo('https://www.pbinfo.ro/')
    stopTour()
  }
  const next = (): void => {
    if (atEnd) return finish()
    if (lastPhase) {
      setSi(si + 1)
      setPi(0)
    } else setPi(pi + 1)
  }
  const prev = (): void => {
    if (atStart) return
    if (pi > 0) setPi(pi - 1)
    else {
      const ps = si - 1
      setSi(ps)
      setPi(TOUR[ps].phases.length - 1)
    }
  }

  const pad = 6
  const vw = window.innerWidth
  const vh = window.innerHeight

  let cardStyle: React.CSSProperties
  if (box) {
    if (box.right + 16 + CARD_W <= vw) {
      cardStyle = { left: box.right + 16, top: clamp(box.top, 16, vh - 200) }
    } else if (box.left - 16 - CARD_W >= 0) {
      cardStyle = { left: box.left - 16 - CARD_W, top: clamp(box.top, 16, vh - 200) }
    } else if (box.bottom + 14 + 170 <= vh) {
      cardStyle = {
        left: clamp(box.left + box.width / 2 - CARD_W / 2, 16, vw - CARD_W - 16),
        top: box.bottom + 14
      }
    } else {
      // A tall spotlight (e.g. the three board lanes) leaves no room beside or
      // below it — float the card over it, bottom-centre.
      cardStyle = {
        left: clamp(box.left + box.width / 2 - CARD_W / 2, 16, vw - CARD_W - 16),
        bottom: 28
      }
    }
  } else {
    cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  const dimApp = !phase.showWebview

  const inner = (
    <>
      {/* Centred phases: pure blur, same in 1/7 and 7/7. */}
      {!box && <div className="absolute inset-0 backdrop-blur-md" />}

      {/* Spotlight: a transparent hole whose huge box-shadow dims everything else. */}
      {box && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/70"
          style={{
            left: box.left - pad,
            top: box.top - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        />
      )}


      {/* Coachmark */}
      <div
        className="absolute w-[300px] max-w-[88vw] animate-pop-in rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-center gap-2">
          {phase.title ? (
            <h3 className="flex-1 text-base font-bold text-slate-900">{phase.title}</h3>
          ) : (
            <span className="flex-1" />
          )}
          <span className="text-[11px] font-semibold text-slate-400">
            {si + 1}/{stageCount}
          </span>
        </div>
        {phase.text && <p className="mt-1 text-sm text-slate-500">{phase.text}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={finish} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
            Skip
          </button>
          <div className="ml-auto flex gap-2">
            {!atStart && (
              <button
                onClick={prev}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Înapoi
              </button>
            )}
            <button
              onClick={next}
              className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
            >
              {atEnd ? 'Gata' : 'Mai departe'}
            </button>
          </div>
        </div>
      </div>
    </>
  )

  // Distinct keys force a remount when switching dim modes, so App's childList
  // observer notices the data-pbinfo-overlay change and shows/hides pbinfo.
  return dimApp ? (
    <div key="dim" data-pbinfo-overlay className="fixed inset-0 z-[70]">
      {inner}
    </div>
  ) : (
    <div key="spot" className="fixed inset-0 z-[70]">
      {inner}
    </div>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
