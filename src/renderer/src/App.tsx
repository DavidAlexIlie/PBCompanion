import { useEffect, useRef } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import BrowseToolbar from './components/BrowseToolbar'
import Home from './components/Home'
import Board from './components/Board'
import GroupsTab from './components/GroupsTab'
import SettingsView from './components/SettingsView'
import CppWorkspace from './components/CppWorkspace'
import ProblemDetail from './components/ProblemDetail'
import Splitter, { usePersistentNumber, clamp } from './components/Splitter'

/**
 * Keeps the main-process WebContentsView aligned with the on-screen region
 * reserved for it. The view is layered ABOVE this React DOM, so we hand main
 * the pixel rect of `ref` and a visibility flag; main calls setBounds().
 */
function useWebviewBounds(ref: React.RefObject<HTMLElement>, visible: boolean): void {
  useEffect(() => {
    const report = (): void => {
      if (!visible || !ref.current) {
        window.api.setPbinfoBounds({ x: 0, y: 0, width: 0, height: 0, visible: false })
        return
      }
      const r = ref.current.getBoundingClientRect()
      window.api.setPbinfoBounds({
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
        visible: true
      })
    }
    report()
    const ro = new ResizeObserver(report)
    if (ref.current) ro.observe(ref.current)
    window.addEventListener('resize', report)
    // Re-report after layout settles (transitions, fonts).
    const t = setTimeout(report, 60)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
      clearTimeout(t)
    }
  }, [ref, visible])
}

export default function App(): JSX.Element {
  const {
    route,
    showWebview,
    webviewFull,
    detailProblemId,
    resizing,
    setDetected,
    refresh,
    refreshSettings
  } = useStore()

  const [sidebarW, setSidebarW] = usePersistentNumber('layout.sidebar', 228)
  const [webviewW, setWebviewW] = usePersistentNumber('layout.webview', 720)
  const baseSidebar = useRef(0)
  const baseWebview = useRef(0)

  const webviewSlot = useRef<HTMLDivElement>(null)
  // The embedded browser hides while a modal/detail panel is open (so the panel
  // isn't occluded) and while resizing (so a splitter under it still gets
  // pointer events).
  const webviewVisible = showWebview && detailProblemId === null && !resizing
  useWebviewBounds(webviewSlot, webviewVisible)

  useEffect(() => {
    refresh()
    refreshSettings()
    const offProblem = window.api.onProblemDetected((p) => setDetected(p))
    const offData = window.api.onDataChanged(() => {
      refresh()
    })
    const offVerdict = window.api.onVerdictDetected(() => {
      /* data:changed already fires from main; nothing extra needed */
    })
    return () => {
      offProblem()
      offData()
      offVerdict()
    }
  }, [])

  const routeView = (): JSX.Element => {
    switch (route) {
      case 'home':
        return <Home />
      case 'board':
        return <Board />
      case 'workspace':
        return <CppWorkspace />
      case 'groups':
        return <GroupsTab />
      case 'settings':
        return <SettingsView />
    }
  }

  const splitMode = showWebview && !webviewFull

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 text-slate-900">
      <div style={{ width: sidebarW }} className="shrink-0">
        <Sidebar />
      </div>
      <Splitter
        onStart={() => (baseSidebar.current = sidebarW)}
        onResize={(dx) => setSidebarW(clamp(baseSidebar.current + dx, 180, 420))}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {showWebview && <BrowseToolbar />}
        <div className="relative flex min-h-0 flex-1">
          {/* Route content. Hidden under the webview when popped to full. */}
          {!(showWebview && webviewFull) && (
            <div className="min-w-0 flex-1 overflow-hidden">{routeView()}</div>
          )}
          {splitMode && (
            <Splitter
              onStart={() => (baseWebview.current = webviewW)}
              onResize={(dx) => setWebviewW(clamp(baseWebview.current - dx, 380, window.innerWidth - 520))}
            />
          )}
          {/* Reserved slot for the embedded pbinfo browser. */}
          {showWebview && (
            <div
              ref={webviewSlot}
              style={webviewFull ? undefined : { width: webviewW }}
              className={
                webviewFull ? 'min-w-0 flex-1 bg-white' : 'shrink-0 bg-white'
              }
            >
              {/* intentionally empty: the WebContentsView floats here */}
            </div>
          )}
        </div>
      </div>

      {detailProblemId !== null && <ProblemDetail problemId={detailProblemId} />}
    </div>
  )
}
