import { useStore, type Route } from '../store'
import logo from '../assets/logo.png'
import { IconHome, IconBoard, IconGroups, IconSettings, IconBrowser, IconCode } from './icons'

type Item = { route: Route; label: string; Icon: (p: { className?: string }) => JSX.Element }

const ITEMS: Item[] = [
  { route: 'home', label: 'Home', Icon: IconHome },
  { route: 'board', label: 'Progress Board', Icon: IconBoard },
  { route: 'workspace', label: 'C++ Workspace', Icon: IconCode },
  { route: 'groups', label: 'Groups', Icon: IconGroups },
  { route: 'settings', label: 'Settings', Icon: IconSettings }
]

export default function Sidebar(): JSX.Element {
  const { route, setRoute, showWebview, setShowWebview, setWebviewFull } = useStore()

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white">
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-center gap-2.5">
          <img src={logo} alt="PBCompanion" className="h-9 w-9 rounded-lg" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">PBCompanion</div>
            <div className="text-xs text-slate-400">pbinfo.ro</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {ITEMS.map(({ route: r, label, Icon }) => {
          const active = route === r
          return (
            <button
              key={r}
              onClick={() => {
                setRoute(r)
                if (r !== 'home') setWebviewFull(false)
              }}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
              <span className="flex-1 text-left">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <button
          onClick={() => setShowWebview(!showWebview)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
            showWebview
              ? 'bg-brand-600 text-white shadow-soft hover:bg-brand-700'
              : 'border border-brand-200 bg-white text-brand-700 hover:bg-brand-50'
          }`}
        >
          <IconBrowser className="h-5 w-5" />
          {showWebview ? 'Hide pbinfo' : 'Browse pbinfo'}
        </button>
      </div>
    </aside>
  )
}
