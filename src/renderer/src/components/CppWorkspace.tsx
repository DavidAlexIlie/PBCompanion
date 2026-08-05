import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import CodeEditor from './CodeEditor'
import type { CompileRunResult, DetectedVerdict, Problem } from '../../../shared/types'
import { detectProblemIoFiles } from '../../../shared/problemIo'
import { formatCpp } from '../../../shared/cppFormat'
import { convertToFileIo } from '../../../shared/cppFileIo'
import { starterFor } from '../../../shared/cppStarter'

export default function CppWorkspace(): JSX.Element {
  const { problems, settings, detected } = useStore()
  const activeProblems = useMemo(
    () => problems.filter((p) => statusFor(p, settings?.bandCompleted ?? 100) === 'in_progress'),
    [problems, settings]
  )
  const [problemId, setProblemId] = useState<number | null>(activeProblems[0]?.id ?? null)
  const problem = activeProblems.find((p) => p.id === problemId) ?? null
  const ioFiles = useMemo(() => detectProblemIoFiles(problem?.statement_html ?? null), [problem])
  const submitMatchesBrowser = problemId !== null && detected?.id === problemId
  const [source, setSource] = useState(() => starterFor({ inputFile: null, outputFile: null }))
  const [input, setInput] = useState('')
  const [result, setResult] = useState<CompileRunResult | null>(null)
  const [busy, setBusy] = useState<'run' | 'submit' | null>(null)
  const [submitStatus, setSubmitStatus] = useState('Ready to submit')

  useEffect(() => {
    if (problemId === null && activeProblems[0]) setProblemId(activeProblems[0].id)
  }, [activeProblems, problemId])

  useEffect(() => {
    if (problemId === null) return
    setSource(localStorage.getItem(draftKey(problemId)) ?? starterFor(ioFiles))
    setResult(null)
    setSubmitStatus('Ready to submit')
    // Only on problem change: a statement arriving later must not wipe typed
    // code. Format upgrades an untouched skeleton instead.
  }, [problemId])

  useEffect(() => {
    if (problemId !== null) localStorage.setItem(draftKey(problemId), source)
  }, [problemId, source])

  useEffect(
    () =>
      window.api.onVerdictDetected((verdict: DetectedVerdict) => {
        if (verdict.problemId !== problemId) return
        const tests =
          verdict.testsTotal === undefined
            ? ''
            : ` · ${verdict.testsFailed ?? 0}/${verdict.testsTotal} tests failed`
        setSubmitStatus(`${verdict.score ?? 0} pts${tests}`)
        setBusy(null)
      }),
    [problemId]
  )

  const run = async (): Promise<void> => {
    if (problemId === null) return
    setBusy('run')
    setResult(await window.api.compileAndRun(problemId, source, input, ioFiles))
    setBusy(null)
  }

  const submit = async (): Promise<void> => {
    if (problemId === null || !source.trim()) return
    setBusy('submit')
    setSubmitStatus('Opening pbinfo and submitting...')
    const response = await window.api.submitSolution(problemId, source)
    setSubmitStatus(
      response.ok ? 'Submitted · waiting for evaluation...' : (response.message ?? 'Submission failed')
    )
    // Unlock as soon as pbinfo has the source: the verdict may take a while,
    // may never be detected, and must never block another run or submit.
    setBusy(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-base font-bold text-slate-900">C++ Workspace</h1>
          <p className="text-xs text-slate-500">Compile locally, then submit through your pbinfo session.</p>
        </div>
        <select
          value={problemId ?? ''}
          onChange={(e) => setProblemId(Number(e.target.value))}
          className="ml-auto min-w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-brand-500"
        >
          {activeProblems.length === 0 && <option value="">No in-progress problems</option>}
          {activeProblems.map((p) => (
            <option key={p.id} value={p.id}>#{p.id} · {p.title ?? p.slug ?? 'Problem'}</option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={!problem || busy !== null || !submitMatchesBrowser}
          title={
            submitMatchesBrowser
              ? 'Submit to pbinfo'
              : 'Open this problem in the pbinfo browser before submitting'
          }
          className="rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          {busy === 'run' ? 'Running...' : 'Run locally'}
        </button>
        <button
          onClick={submit}
          disabled={!problem || busy !== null}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-bold text-white shadow-soft hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === 'submit' ? 'Submitting...' : 'Submit'}
        </button>
      </header>

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
            <span className="ml-auto text-brand-700">{submitStatus}</span>
          </div>
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
              <pre className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs ${result?.ok ? 'text-slate-700' : 'text-rose-700'}`}>
                {result ? [result.stdout, result.stderr].filter(Boolean).join('\n') || '(no output)' : 'Run the code to see output.'}
              </pre>
            </div>
          </div>
        </section>
        {/* The statement lives in the real pbinfo page docked to the right
            (App.tsx keeps the embedded browser visible on this route). */}
      </div>
    </div>
  )
}

function draftKey(problemId: number): string {
  return `cpp-workspace.draft.${problemId}`
}

function statusFor(problem: Problem, completedThreshold: number): string {
  return problem.user_status ?? ((problem.detected_score ?? 0) >= completedThreshold ? 'completed' : 'in_progress')
}
