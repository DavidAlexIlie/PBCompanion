import { useState } from 'react'
import type { Problem } from '../../../shared/types'
import { cleanProblemName } from '../../../shared/text'

/**
 * Manually set a problem's score (and optionally paste the code), for problems
 * already solved on pbinfo before the app saw the submission. This records a
 * normal attempt, so the derived score and the attempts list both update.
 */
export default function EditScoreModal({
  problem,
  onClose,
  onSaved
}: {
  problem: Problem
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [score, setScore] = useState<string>(
    problem.detected_score === null ? '' : String(problem.detected_score)
  )
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)

  const n = Number(score)
  const valid = score.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100

  const save = async (): Promise<void> => {
    if (!valid || saving) return
    setSaving(true)
    await window.api.addManualAttempt(problem.id, Math.round(n), code.trim() ? code : null)
    setSaving(false)
    onSaved()
  }

  return (
    <div
      data-pbinfo-overlay
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-6"
      onMouseDown={onClose}
    >
      <div
        className="w-[520px] max-w-[92vw] animate-pop-in rounded-2xl bg-white p-6 shadow-lift"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-900">Edit score</h3>
        <p className="mt-1 text-sm text-slate-500">
          {cleanProblemName(problem.title, problem.id, problem.slug)} (#{problem.id})
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Score (0–100)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={score}
              autoFocus
              onChange={(e) => setScore(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Code (optional)
            </span>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste the source code you submitted (optional)…"
              spellCheck={false}
              className="h-48 w-full resize-y rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!valid || saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Save attempt
          </button>
        </div>
      </div>
    </div>
  )
}
