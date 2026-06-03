import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { useStore } from '../store'
import { scoreBand, bandTag } from '../lib/score'
import { cleanProblemName } from '../../../shared/text'
import { cleanSourceCode } from '../../../shared/sourceCode'
import { IconClose, IconTrash, IconExternal, IconNote, IconBoard, IconCopy, IconCheckMark } from './icons'
import type { Attempt } from '../../../shared/types'

export default function ProblemDetail({ problemId }: { problemId: number }): JSX.Element {
  const { problems, settings, openDetail, setShowWebview } = useStore()
  const problem = problems.find((p) => p.id === problemId)
  const [attempts, setAttempts] = useState<Attempt[]>([])

  const loadAttempts = (): void => {
    window.api.listAttempts(problemId).then(setAttempts)
  }
  useEffect(loadAttempts, [problemId, problems])

  // Closing the problem closes its Notes + Whiteboard windows (they autosave).
  useEffect(() => {
    return () => void window.api.closeProblemPanels(problemId)
  }, [problemId])

  if (!problem || !settings) return <div />
  const band = scoreBand(problem.detected_score, settings)
  const cleanStatement = problem.statement_html
    ? DOMPurify.sanitize(problem.statement_html, { USE_PROFILES: { html: true } })
    : null

  const openInPbinfo = (): void => {
    setShowWebview(true)
    window.api.navigatePbinfo(problem.url ?? `https://www.pbinfo.ro/probleme/${problem.id}`)
    openDetail(null)
  }

  const deleteAttempt = async (id: number): Promise<void> => {
    await window.api.deleteAttempt(id)
    loadAttempts()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-pop-in items-center justify-center bg-slate-900/40 p-6"
      onMouseDown={() => openDetail(null)}
    >
      <div
        className="flex max-h-[88vh] w-[720px] max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-slate-200 px-6 py-5">
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-t-full rounded-b-xl border border-slate-200 ring-2 ring-brand-200">
            <span className="text-xl font-extrabold text-brand-700">{problem.id}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-900">
              {cleanProblemName(problem.title, problem.id, problem.slug)}
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${bandTag[band]}`}>
                {problem.detected_score === null ? 'no score yet' : `${problem.detected_score} pts`}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">{problem.slug}</span>
            </div>
          </div>
          <button
            onClick={() => openDetail(null)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-3">
          <button
            onClick={() => window.api.openPanel('notes', problem.id)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <IconNote className="h-4 w-4" /> Notes
          </button>
          <button
            onClick={() => window.api.openPanel('whiteboard', problem.id)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <IconBoard className="h-4 w-4" /> Whiteboard
          </button>
          <button
            onClick={openInPbinfo}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <IconExternal className="h-4 w-4" /> Open in pbinfo
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Statement
            </h3>
            {cleanStatement ? (
              <div
                className="statement-html rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-700"
                dangerouslySetInnerHTML={{ __html: cleanStatement }}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                Statement not captured yet. Open the problem in pbinfo to cache it.
              </div>
            )}
          </section>

          <section className="mt-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              My attempts ({attempts.length})
            </h3>
            {attempts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-400">
                No attempts recorded. Submit on pbinfo and the verdict will be captured here.
              </div>
            ) : (
              <div className="space-y-3">
                {attempts.map((a) => {
                  const ab = scoreBand(a.score, settings)
                  return (
                    <div key={a.id} className="rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${bandTag[ab]}`}>
                          {a.score === null ? '—' : `${a.score} pts`}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(a.submitted_at).toLocaleString()}
                        </span>
                        <button
                          onClick={() => deleteAttempt(a.id)}
                          title="Delete this local record (does not touch pbinfo)"
                          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                      {a.source_code ? (
                        <CodeBlock source={a.source_code} />
                      ) : (
                        <div className="px-4 py-2 text-xs italic text-slate-400">
                          Source code not captured for this attempt.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/** Visual line numbers are separate DOM nodes; source and clipboard stay clean. */
function CodeBlock({ source }: { source: string }): JSX.Element {
  const code = cleanSourceCode(source)
  const lines = code.split('\n')
  return (
    <div className="group relative max-h-64 overflow-auto rounded-b-xl bg-slate-900 py-3 text-xs leading-relaxed">
      <CopyButton code={code} />
      <div className="min-w-max font-mono">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span
              aria-hidden="true"
              className="w-12 shrink-0 select-none border-r border-slate-700/70 pr-3 text-right text-slate-500"
            >
              {index + 1}
            </span>
            <code className="whitespace-pre px-3 text-slate-100">{line || ' '}</code>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Copy-to-clipboard button overlaid on a captured-code block. */
function CopyButton({ code }: { code: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — ignore */
    }
  }
  return (
    <button
      onClick={copy}
      title={copied ? 'Copied!' : 'Copy code'}
      className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md bg-slate-700/80 px-2 py-1 text-xs font-medium text-slate-100 opacity-0 transition hover:bg-slate-600 group-hover:opacity-100"
    >
      {copied ? <IconCheckMark className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
