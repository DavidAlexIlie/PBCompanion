import { create } from 'zustand'
import type {
  Problem,
  GroupWithMembers,
  AppSettings,
  DetectedProblem,
  UserStatus
} from '../../shared/types'

export type Route = 'home' | 'board' | 'groups' | 'settings'

interface State {
  problems: Problem[]
  groups: GroupWithMembers[]
  settings: AppSettings | null
  route: Route
  detected: DetectedProblem | null // problem currently visible in the webview
  detailProblemId: number | null // open problem-detail panel
  showWebview: boolean // is the embedded pbinfo browser visible?
  webviewFull: boolean // pop webview to full width while solving
  resizing: boolean // a splitter is being dragged (suppress the webview overlay)

  setRoute: (r: Route) => void
  setDetected: (d: DetectedProblem | null) => void
  openDetail: (id: number | null) => void
  setShowWebview: (v: boolean) => void
  setWebviewFull: (v: boolean) => void
  setResizing: (v: boolean) => void

  refresh: () => Promise<void>
  refreshSettings: () => Promise<void>
}

export const useStore = create<State>((set, get) => ({
  problems: [],
  groups: [],
  settings: null,
  route: 'home',
  detected: null,
  detailProblemId: null,
  showWebview: false,
  webviewFull: false,
  resizing: false,

  setRoute: (r) => set({ route: r }),
  setDetected: (d) => set({ detected: d }),
  openDetail: (id) => set({ detailProblemId: id }),
  setShowWebview: (v) => set({ showWebview: v, webviewFull: v ? get().webviewFull : false }),
  setWebviewFull: (v) => set({ webviewFull: v }),
  setResizing: (v) => set({ resizing: v }),

  refresh: async () => {
    const [problems, groups] = await Promise.all([
      window.api.listProblems(),
      window.api.listGroups()
    ])
    set({ problems, groups })
  },
  refreshSettings: async () => {
    set({ settings: await window.api.getSettings() })
  }
}))

// Convenience selectors
export const isKnown = (id: number): boolean =>
  useStore.getState().problems.some((p) => p.id === id)
