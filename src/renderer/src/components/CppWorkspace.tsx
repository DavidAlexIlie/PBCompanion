import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import CodeEditor from './CodeEditor'
import type {
  CompileRunResult,
  DetectedVerdict,
  PbinfoNavState,
  Problem,
  ProblemIoFiles
} from '../../../shared/types'
import { detectProblemIoFiles } from '../../../shared/problemIo'
import { formatCpp } from '../../../shared/cppFormat'
import { convertToFileIo } from '../../../shared/cppFileIo'
import { starterFor, isStarterTemplate } from '../../../shared/cppStarter'
import { cleanProblemName } from '../../../shared/text'
import { scoreBand, bandTag, displayStatus } from '../lib/score'
import { IconPlus } from './icons'

/**
 * The workspace always works on the problem open in the docked pbinfo browser:
 * one active problem, never a separate picker that can drift from the
 * statement the user is reading. An untracked problem shows a start screen
 * instead of an editor, so no code is ever typed against the wrong problem.
 */
export default function CppWorkspace(): JSX.Element {
  const { problems, settings, detected, refresh } = useStore()
  const nav = useNavState()
  const [picking, setPicking] = useState(false)

  const activeId = detected?.id ?? null
  const problem = activeId === null ? null : (problems.find((p) => p.id === activeId) ?? null)
  const name = detected ? cleanProblemName(detected.title, detected.id, detected.slug) : ''
  const ioFiles = useMemo(
    () => detectProblemIoFiles(detected?.statementHtml ?? problem?.statement_html ?? null),
    [detected, problem?.statement_html]
  )
  const browserOnProblem = activeId !== null && nav.url.includes(`/probleme/${activeId}`)

  const continueList = useMemo(
    () =>
      settings
        ? problems
            .filter((p) => p.id !== activeId && displayStatus(p, settings) === 'in_progress')
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, 6)
        : [],
    [problems, settings, activeId]
  )

  const start = async (): Promise<void> => {
    if (!detected) return
    await window.api.registerProblem(detected)
    await refresh()
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <header className="flex min-h-[64px] items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        {detected ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-xs font-bold text-white">
                #{detected.id}
              </span>
              <h1 className="truncate text-base font-bold text-slate-900">{name}</h1>
              {problem && settings && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    bandTag[scoreBand(problem.detected_score, settings)]
                  }`}
                >
                  {problem.detected_score === null ? 'in progress' : `${problem.detected_score} pts`}
                </span>
              )}
              {!picking && (
                <button
                  onClick={() => setPicking(true)}
                  className="shrink-0 rounded-md border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  Change
                </button>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{ioLabel(ioFiles)}</p>
          </div>
        ) : (
          <div>
            <h1 className="text-base font-bold text-slate-900">C++ Workspace</h1>
            <p className="text-xs text-slate-500">Open a problem in pbinfo to start working on it.</p>
          </div>
        )}
        {detected && !browserOnProblem && (
          <button
            onClick={() => window.api.navigatePbinfo(problemUrl(detected.id, detected.url))}
            className="ml-auto shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Back to #{detected.id} in pbinfo
          </button>
        )}
      </header>

      {picking || !detected ? (
        <Picker
          problems={problems}
          activeId={activeId}
          onPick={(p) => {
            setPicking(false)
            if (p.id !== activeId) window.api.navigatePbinfo(problemUrl(p.id, p.url))
          }}
          onCancel={detected ? () => setPicking(false) : undefined}
        />
      ) : !problem ? (
        <StartScreen
          title={`You are not working on #${detected.id} yet`}
          body={`Starting it adds ${name} to In Progress on your Progress Board and opens a ${
            ioFiles.inputFile || ioFiles.outputFile ? 'file I/O' : 'stdin/stdout'
          } C++ skeleton.`}
          action={
            <button
              onClick={start}
              className="flex animate-pop-in items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-base font-bold text-white shadow-lift hover:bg-brand-700"
            >
              <IconPlus className="h-5 w-5" /> Start problem
            </button>
          }
          continueList={continueList}
        />
      ) : (
        <Editor key={problem.id} problem={problem} ioFiles={ioFiles} browserOnProblem={browserOnProblem} />
      )}
    </div>
  )
}

function Editor(props: {
  problem: Problem
  ioFiles: ProblemIoFiles
  browserOnProblem: boolean
}): JSX.Element {
  const { problem, ioFiles, browserOnProblem } = props
  const { settings, workspaceLoad, setWorkspaceLoad } = useStore()
  // Keyed by problem id in the parent, so this state never carries one
  // problem's code into another's draft.
  const [source, setSource] = useState(
    () => localStorage.getItem(draftKey(problem.id)) ?? starterFor(ioFiles)
  )
  const [input, setInput] = useState('')
  const [result, setResult] = useState<CompileRunResult | null>(null)
  const [busy, setBusy] = useState<'run' | 'submit' | null>(null)
  const [submitStatus, setSubmitStatus] = useState('')
  // The draft a loaded saved solution replaced, offered back once.
  const [replacedDraft, setReplacedDraft] = useState<string | null>(null)

  useEffect(() => {
    if (workspaceLoad?.problemId !== problem.id) return
    setWorkspaceLoad(null)
    if (workspaceLoad.source === source) return
    if (!isStarterTemplate(source)) setReplacedDraft(source)
    setSource(workspaceLoad.source)
    setSubmitStatus('Saved solution loaded')
  }, [workspaceLoad, problem.id])

  useEffect(() => {
    localStorage.setItem(draftKey(problem.id), source)
  }, [problem.id, source])

  useEffect(
    () =>
      window.api.onVerdictDetected((verdict: DetectedVerdict) => {
        if (verdict.problemId !== problem.id) return
        const tests =
          verdict.testsTotal === undefined
            ? ''
            : ` · ${verdict.testsFailed ?? 0}/${verdict.testsTotal} tests failed`
        setSubmitStatus(`${verdict.score ?? 0} pts${tests}`)
        setBusy(null)
      }),
    [problem.id]
  )

  const run = async (): Promise<void> => {
    setBusy('run')
    setResult(await window.api.compileAndRun(problem.id, source, input, ioFiles))
    setBusy(null)
  }

  const submit = async (): Promise<void> => {
    if (!source.trim()) return
    setBusy('submit')
    setSubmitStatus('Submitting...')
    const response = await window.api.submitSolution(problem.id, source)
    setSubmitStatus(
      response.ok ? 'Submitted · waiting for evaluation...' : (response.message ?? 'Submission failed')
    )
    // Unlock as soon as pbinfo has the source: the verdict may take a while,
    // may never be detected, and must never block another run or submit.
    setBusy(null)
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 p-3">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">
          main.cpp
          <button
            onClick={() => setSource(formatCpp(source))}
            title="Shift+Alt+F"
            className="rounded-md border border-slate-200 px-2 py-0.5 font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            Format
          </button>
          {(ioFiles.inputFile || ioFiles.outputFile) && (
            <button
              onClick={() => setSource(convertToFileIo(source, ioFiles))}
              title="Convert to file I/O"
              className="rounded-md border border-slate-200 px-2 py-0.5 font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Convert
            </button>
          )}
          <span className="ml-auto truncate text-brand-700">{submitStatus}</span>
          <button
            onClick={run}
            disabled={busy !== null}
            className="rounded-lg border border-brand-200 bg-white px-4 py-1.5 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            {busy === 'run' ? 'Running...' : 'Run locally'}
          </button>
          <button
            onClick={submit}
            disabled={busy !== null || !browserOnProblem}
            title={
              browserOnProblem
                ? `Submit to pbinfo #${problem.id}`
                : `Open #${problem.id} in the pbinfo browser to submit`
            }
            className="rounded-lg bg-brand-600 px-5 py-1.5 text-sm font-bold text-white shadow-soft hover:bg-brand-700 disabled:opacity-50"
          >
            {busy === 'submit' ? 'Submitting...' : 'Submit'}
          </button>
        </div>
        {replacedDraft !== null && (
          <div className="flex items-center gap-3 border-b border-brand-100 bg-brand-50 px-4 py-2 text-xs text-brand-800">
            <span className="font-semibold">Saved solution loaded into main.cpp.</span>
            <span className="text-brand-700">It replaced your previous draft.</span>
            <button
              onClick={() => {
                setSource(replacedDraft)
                setReplacedDraft(null)
                setSubmitStatus('')
              }}
              className="ml-auto rounded-md border border-brand-200 bg-white px-2 py-0.5 font-semibold text-brand-700 hover:bg-brand-100"
            >
              Restore draft
            </button>
            <button
              onClick={() => setReplacedDraft(null)}
              className="rounded-md px-2 py-0.5 font-semibold text-brand-700 hover:bg-brand-100"
            >
              Keep solution
            </button>
          </div>
        )}
        <CodeEditor
          value={source}
          onChange={setSource}
          theme={settings?.theme ?? 'light'}
          className="min-h-0 flex-1 overflow-hidden"
        />
        <div className="grid h-52 grid-cols-2 border-t border-slate-200">
          <label className="flex min-w-0 flex-col border-r border-slate-200">
            <span className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {ioFiles.inputFile ? `Input · ${ioFiles.inputFile}` : 'Input · stdin'}
            </span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-0 flex-1 resize-none p-3 font-mono text-xs outline-none"
              placeholder="Input for local run..."
            />
          </label>
          <div className="flex min-w-0 flex-col">
            <span className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {result?.phase === 'compile'
                ? 'Compiler'
                : `Output · ${result?.outputFile ?? ioFiles.outputFile ?? 'stdout'}`}
            </span>
            <pre
              className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs ${result?.ok ? 'text-slate-700' : 'text-rose-700'}`}
            >
              {result
                ? [result.stdout, result.stderr].filter(Boolean).join('\n') || '(no output)'
                : 'Run the code to see output.'}
            </pre>
          </div>
        </div>
      </section>
      {/* The statement lives in the real pbinfo page docked to the right
          (App.tsx keeps the embedded browser visible on this route). */}
    </div>
  )
}

function StartScreen(props: {
  title: string
  body: string
  action?: JSX.Element
  continueList: Problem[]
}): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
      <div className="w-full max-w-lg text-center">
        <h2 className="text-xl font-bold text-slate-900">{props.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{props.body}</p>
        {props.action && <div className="mt-6 flex justify-center">{props.action}</div>}
        {props.continueList.length > 0 && (
          <div className="mt-10 text-left">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Continue
            </h3>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {props.continueList.map((p) => (
                <button
                  key={p.id}
                  onClick={() => window.api.navigatePbinfo(problemUrl(p.id, p.url))}
                  className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <span className="text-xs font-bold text-slate-400">#{p.id}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                    {cleanProblemName(p.title, p.id, p.slug)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {p.detected_score === null ? 'no score' : `${p.detected_score} pts`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Picker(props: {
  problems: Problem[]
  activeId: number | null
  onPick: (p: Problem) => void
  onCancel?: () => void
}): JSX.Element {
  const { settings } = useStore()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase().replace(/^#/, '')
  const list = useMemo(
    () =>
      props.problems
        // Only In Progress problems belong here — Completed/DNF are done, you
        // don't pick them to work on. Open them in pbinfo if you need them.
        .filter((p) => settings && displayStatus(p, settings) === 'in_progress')
        .filter(
          (p) =>
            !q ||
            String(p.id).startsWith(q) ||
            cleanProblemName(p.title, p.id, p.slug).toLowerCase().includes(q)
        )
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [props.problems, q, settings]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden p-6">
      <div className="flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-900">Pick a problem</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose one of your problems, or open any problem in the pbinfo browser on the right.
            </p>
          </div>
          {props.onCancel && (
            <button
              onClick={props.onCancel}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by number or name..."
          className="mt-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500"
        />
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {list.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              {q ? 'No in-progress problem matches.' : 'No in-progress problems.'}
            </div>
          ) : (
            list.map((p) => (
              <button
                key={p.id}
                onClick={() => props.onPick(p)}
                className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-slate-50 ${
                  p.id === props.activeId ? 'bg-brand-50' : ''
                }`}
              >
                <span className="w-12 shrink-0 text-xs font-bold text-slate-400">#{p.id}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                  {cleanProblemName(p.title, p.id, p.slug)}
                </span>
                {settings && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      bandTag[scoreBand(p.detected_score, settings)]
                    }`}
                  >
                    {p.detected_score === null ? 'no score' : `${p.detected_score} pts`}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function useNavState(): PbinfoNavState {
  const [nav, setNav] = useState<PbinfoNavState>({
    url: '',
    canGoBack: false,
    canGoForward: false,
    loading: false
  })
  useEffect(() => {
    const off = window.api.onNavState(setNav)
    window.api.getPbinfoNavState().then(setNav)
    return off
  }, [])
  return nav
}

function ioLabel(io: ProblemIoFiles): string {
  if (!io.inputFile && !io.outputFile) return 'stdin → stdout'
  return `${io.inputFile ?? 'stdin'} → ${io.outputFile ?? 'stdout'}`
}

function problemUrl(id: number, url: string | null): string {
  return url ?? `https://www.pbinfo.ro/probleme/${id}`
}

function draftKey(problemId: number): string {
  return `cpp-workspace.draft.${problemId}`
}
