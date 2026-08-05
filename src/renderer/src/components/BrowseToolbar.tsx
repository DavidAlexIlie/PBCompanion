import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { scoreBand, bandTag } from '../lib/score'
import { cleanProblemName } from '../../../shared/text'
import type { PbinfoNavState } from '../../../shared/types'
import {
  IconBack,
  IconForward,
  IconReload,
  IconExpand,
  IconCollapse,
  IconPlus
} from './icons'

export default function BrowseToolbar(): JSX.Element {
  const { detected, problems, settings, webviewFull, setWebviewFull, refresh } = useStore()
  const [nav, setNav] = useState<PbinfoNavState>({
    url: '',
    canGoBack: false,
    canGoForward: false,
    loading: false
  })

  useEffect(() => {
    const off = window.api.onNavState(setNav)
    // Recover real back/forward availability after a Hide → Browse remount
    // (the webview keeps its history; only this toolbar's state was reset).
    window.api.getPbinfoNavState().then(setNav)
    return off
  }, [])

  const known = detected ? problems.find((p) => p.id === detected.id) : undefined

  // Track the problem without interrupting: no detail panel pops open, the
  // NEW pill just turns into the "tracked" badge.
  const registerNew = async (): Promise<void> => {
    if (!detected) return
    await window.api.registerProblem(detected)
    await refresh()
  }

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1">
        <ToolBtn disabled={!nav.canGoBack} onClick={() => window.api.pbinfoBack()} title="Back">
          <IconBack className="h-4.5 w-4.5" />
        </ToolBtn>
        <ToolBtn
          disabled={!nav.canGoForward}
          onClick={() => window.api.pbinfoForward()}
          title="Forward"
        >
          <IconForward className="h-4.5 w-4.5" />
        </ToolBtn>
        <ToolBtn onClick={() => window.api.pbinfoReload()} title="Reload">
          <IconReload className="h-4.5 w-4.5" />
        </ToolBtn>
      </div>

      <div className="mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${nav.loading ? 'bg-amber-400' : 'bg-emerald-500'}`}
        />
        <span className="truncate text-xs text-slate-500">{nav.url || 'pbinfo.ro'}</span>
      </div>

      {/* Detected-problem indicator + NEW button (always visible, never under the webview). */}
      {detected && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
          <span className="text-xs font-semibold text-slate-700">#{detected.id}</span>
          <span className="max-w-[160px] truncate text-xs text-slate-500">
            {cleanProblemName(detected.title, detected.id, detected.slug)}
          </span>
          {known ? (
            settings && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  bandTag[scoreBand(known.detected_score, settings)]
                }`}
              >
                {known.detected_score === null ? 'tracked' : `${known.detected_score} pts`}
              </span>
            )
          ) : (
            <button
              onClick={registerNew}
              className="flex animate-pop-in items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-soft hover:bg-brand-700"
            >
              <IconPlus className="h-3.5 w-3.5" /> New
            </button>
          )}
        </div>
      )}

      <ToolBtn onClick={() => setWebviewFull(true)} disabled={webviewFull} title="Make window big">
        <IconExpand className="h-4.5 w-4.5" />
      </ToolBtn>
      <ToolBtn onClick={() => setWebviewFull(false)} disabled={!webviewFull} title="Make window small">
        <IconCollapse className="h-4.5 w-4.5" />
      </ToolBtn>
    </div>
  )
}

function ToolBtn(props: {
  children: JSX.Element
  onClick: () => void
  disabled?: boolean
  title?: string
}): JSX.Element {
  return (
    <button
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {props.children}
    </button>
  )
}
