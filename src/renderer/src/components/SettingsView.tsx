import { useState } from 'react'
import { useStore } from '../store'
import { IconReload } from './icons'
import type { AppSettings } from '../../../shared/types'

export default function SettingsView(): JSX.Element {
  const { settings, refreshSettings, refresh } = useStore()
  const [syncState, setSyncState] = useState<'idle' | 'pushing' | 'success' | 'error'>('idle')
  const [syncMessage, setSyncMessage] = useState('')
  if (!settings) return <div />

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    await window.api.setSettings(patch)
    await refreshSettings()
    await refresh()
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-slate-500">Local-first. Everything lives on your machine.</p>

        <Section title="Submissions">
          <Toggle
            label="Keep only best submission"
            desc="Discard all but the highest-scoring attempt per problem (destructive, local only)."
            checked={settings.keepOnlyBest}
            onChange={(v) => {
              if (v && !confirm('This permanently deletes all non-best local attempts. Continue?')) return
              update({ keepOnlyBest: v })
            }}
          />
          <Toggle
            label="Auto-move to Completed on 100 points"
            desc="When pbinfo reports a full score. Never overrides a problem you placed manually."
            checked={settings.autoMoveOnHundred}
            onChange={(v) => update({ autoMoveOnHundred: v })}
          />
        </Section>

        <Section title="Score bands (token coloring)">
          <NumberField
            label="Partial threshold"
            desc="Score at/above this (and below the completed threshold) shows amber."
            value={settings.bandPartialMin}
            min={1}
            max={99}
            onCommit={(n) => update({ bandPartialMin: n })}
          />
          <NumberField
            label="Completed threshold"
            desc="Score at/above this shows solid blue and counts as completed."
            value={settings.bandCompleted}
            min={1}
            max={100}
            onCommit={(n) => update({ bandCompleted: n })}
          />
        </Section>

        <Section title="Data & session">
          <Row
            label="Mobile sync"
            desc={
              syncState === 'success'
                ? 'Snapshot pushed successfully.'
                : syncState === 'error'
                  ? syncMessage
                  : 'Push the latest board, groups, notes and whiteboards now.'
            }
            action={
              <button
                disabled={syncState === 'pushing'}
                onClick={async () => {
                  setSyncState('pushing')
                  const result = await window.api.pushSyncNow()
                  if (result.ok) {
                    setSyncMessage('')
                    setSyncState('success')
                  } else {
                    setSyncMessage(
                      result.reason === 'not_configured'
                        ? 'Sync is not configured in the active data folder.'
                        : result.reason === 'busy'
                          ? 'A sync is already running. Try again in a moment.'
                          : `Push failed${result.message ? `: ${result.message}` : '.'}`
                    )
                    setSyncState('error')
                  }
                  setTimeout(() => {
                    setSyncState('idle')
                    setSyncMessage('')
                  }, 5000)
                }}
                className="flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-50"
              >
                <IconReload
                  className={`h-4 w-4 ${syncState === 'pushing' ? 'animate-spin' : ''}`}
                />
                {syncState === 'pushing' ? 'Pushing...' : 'Push now'}
              </button>
            }
          />
          <Row
            label="Data folder"
            desc={settings.dataDir}
            action={
              <div className="flex gap-2">
                <button
                  onClick={() => window.api.openDataDir()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open
                </button>
                <button
                  onClick={async () => {
                    const dir = await window.api.chooseDataDir()
                    if (dir) {
                      await refreshSettings()
                      await refresh()
                    }
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Change…
                </button>
              </div>
            }
          />
          <Row
            label="pbinfo session"
            desc="Sign out of the embedded browser and clear its cookies."
            action={
              <button
                onClick={async () => {
                  if (confirm('Reset the pbinfo session? You will need to log in again.'))
                    await window.api.resetSession()
                }}
                className="rounded-lg border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
              >
                Reset session
              </button>
            }
          />
          <Row
            label="Local organizer data"
            desc="Delete all problems, attempts and groups from the local database."
            action={
              <button
                onClick={async () => {
                  if (confirm('Permanently delete ALL local problems, attempts and groups?')) {
                    await window.api.clearLocalData()
                    await refresh()
                  }
                }}
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Clear data
              </button>
            }
          />
        </Section>

        <p className="mt-8 text-center text-xs text-slate-400">
          PBCompanion reads only your own pbinfo data. pbinfo remains the source of truth for
          grading. Trash/delete affects local records only.
        </p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
      <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  )
}

function Toggle({
  label,
  desc,
  checked,
  onChange
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1">
        <div className="font-medium text-slate-800">{label}</div>
        <div className="text-sm text-slate-500">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  )
}

function NumberField({
  label,
  desc,
  value,
  min,
  max,
  onCommit
}: {
  label: string
  desc: string
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1">
        <div className="font-medium text-slate-800">{label}</div>
        <div className="text-sm text-slate-500">{desc}</div>
      </div>
      <input
        type="number"
        defaultValue={value}
        min={min}
        max={max}
        onBlur={(e) => {
          const n = Math.max(min, Math.min(max, Number(e.target.value)))
          if (n !== value) onCommit(n)
        }}
        className="w-20 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  )
}

function Row({
  label,
  desc,
  action
}: {
  label: string
  desc: string
  action: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-800">{label}</div>
        <div className="truncate text-sm text-slate-500">{desc}</div>
      </div>
      {action}
    </div>
  )
}
