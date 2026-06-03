import { useStore } from '../store'
import { displayStatus, scoreBand } from '../lib/score'
import { cleanProblemName } from '../../../shared/text'
import { IconProgress, IconCheck, IconDnf, IconBrowser, IconGroups } from './icons'

export default function Home(): JSX.Element {
  const { problems, groups, settings, setShowWebview, setWebviewFull, setRoute } = useStore()
  if (!settings) return <div />

  const counts = { in_progress: 0, completed: 0, dnf: 0 } as Record<string, number>
  for (const p of problems) counts[displayStatus(p, settings)]++

  const recent = [...problems]
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    .slice(0, 8)

  const startBrowsing = (): void => {
    setShowWebview(true)
    setWebviewFull(false)
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6 xl:px-8 xl:py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-slate-500">
          Your launchpad for pbinfo. Browse the real site, register problems, and track progress.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">
          <StatCard label="In Progress" value={counts.in_progress} Icon={IconProgress} accent="text-brand-600" onClick={() => setRoute('board')} />
          <StatCard label="Completed" value={counts.completed} Icon={IconCheck} accent="text-emerald-600" onClick={() => setRoute('board')} />
          <StatCard label="DNF" value={counts.dnf} Icon={IconDnf} accent="text-rose-500" onClick={() => setRoute('board')} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <button
            onClick={startBrowsing}
            className="group flex items-center gap-4 rounded-2xl bg-brand-600 px-6 py-5 text-left text-white shadow-soft transition hover:bg-brand-700"
          >
            <IconBrowser className="h-8 w-8" />
            <div>
              <div className="text-lg font-semibold">Browse pbinfo</div>
              <div className="text-sm text-brand-100">Open the live site and start solving</div>
            </div>
          </button>
          <button
            onClick={() => setRoute('groups')}
            className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-left text-slate-800 shadow-soft transition hover:border-brand-200 hover:bg-brand-50/50"
          >
            <IconGroups className="h-8 w-8 text-brand-600" />
            <div>
              <div className="text-lg font-semibold">Groups</div>
              <div className="text-sm text-slate-500">{groups.length} group{groups.length === 1 ? '' : 's'} organized</div>
            </div>
          </button>
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Recent activity
          </h2>
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-slate-400">
              Nothing yet. Hit <span className="font-semibold text-brand-600">Browse pbinfo</span>,
              open a problem, and press <span className="font-semibold">NEW</span>.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {recent.map((p) => {
                const band = scoreBand(p.detected_score, settings)
                return (
                  <button
                    key={p.id}
                    onClick={() => useStore.getState().openDetail(p.id)}
                    className="flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3 text-left last:border-0 hover:bg-slate-50"
                  >
                    <span className="w-14 shrink-0 font-bold text-brand-700">#{p.id}</span>
                    <span className="flex-1 truncate text-slate-700">
                      {cleanProblemName(p.title, p.id, p.slug)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        band === 'complete'
                          ? 'bg-brand-600 text-white'
                          : band === 'partial'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.detected_score === null ? 'tracked' : `${p.detected_score} pts`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  Icon,
  accent,
  onClick
}: {
  label: string
  value: number
  Icon: (p: { className?: string }) => JSX.Element
  accent: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift xl:gap-4 xl:px-5"
    >
      <Icon className={`h-7 w-7 ${accent}`} />
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="truncate text-sm text-slate-500">{label}</div>
      </div>
    </button>
  )
}
