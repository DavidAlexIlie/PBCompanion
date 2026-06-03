/**
 * index.ts — PRELOAD FOR OUR OWN REACT RENDERER.
 *
 * Exposes a small, typed `window.api` surface via contextBridge. The renderer
 * never touches Node or ipcRenderer directly; everything goes through here.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type {
  Problem,
  Attempt,
  GroupWithMembers,
  AppSettings,
  UserStatus,
  DetectedProblem,
  DetectedVerdict,
  ViewBounds,
  PbinfoNavState,
  CompileRunResult,
  SubmitSolutionResult,
  ProblemIoFiles
} from '../shared/types'

const api = {
  // ---- problems ----
  listProblems: (): Promise<Problem[]> => ipcRenderer.invoke('problems:list'),
  registerProblem: (p: DetectedProblem): Promise<Problem> =>
    ipcRenderer.invoke('problems:register', p),
  setProblemStatus: (id: number, status: UserStatus, sortIndex?: number): Promise<void> =>
    ipcRenderer.invoke('problems:setStatus', { id, status, sortIndex }),
  reorderProblems: (orderedIds: number[]): Promise<void> =>
    ipcRenderer.invoke('problems:reorder', { orderedIds }),
  deleteProblem: (id: number): Promise<void> => ipcRenderer.invoke('problems:delete', id),
  setProblemMarked: (id: number, marked: boolean): Promise<void> =>
    ipcRenderer.invoke('problems:setMarked', { id, marked }),

  // ---- attempts ----
  listAttempts: (problemId: number): Promise<Attempt[]> =>
    ipcRenderer.invoke('attempts:list', problemId),
  deleteAttempt: (attemptId: number): Promise<void> =>
    ipcRenderer.invoke('attempts:delete', attemptId),
  addManualAttempt: (problemId: number, score: number, sourceCode: string | null): Promise<void> =>
    ipcRenderer.invoke('attempts:addManual', { problemId, score, sourceCode }),

  // ---- groups ----
  listGroups: (): Promise<GroupWithMembers[]> => ipcRenderer.invoke('groups:list'),
  createGroup: (g: { name: string; color: string; icon: string }): Promise<GroupWithMembers> =>
    ipcRenderer.invoke('groups:create', g),
  updateGroup: (
    id: number,
    g: { name?: string; color?: string; icon?: string }
  ): Promise<void> => ipcRenderer.invoke('groups:update', { id, ...g }),
  deleteGroup: (id: number): Promise<void> => ipcRenderer.invoke('groups:delete', id),
  addProblemToGroup: (groupId: number, problemId: number): Promise<void> =>
    ipcRenderer.invoke('groups:addProblem', { groupId, problemId }),
  removeProblemFromGroup: (groupId: number, problemId: number): Promise<void> =>
    ipcRenderer.invoke('groups:removeProblem', { groupId, problemId }),

  // ---- per-problem notes + whiteboard ----
  getDoc: (id: number): Promise<{ notes: string; whiteboard: string }> =>
    ipcRenderer.invoke('doc:get', id),
  saveNotes: (id: number, notes: string): Promise<void> =>
    ipcRenderer.invoke('doc:saveNotes', { id, notes }),
  saveWhiteboard: (id: number, whiteboard: string): Promise<void> =>
    ipcRenderer.invoke('doc:saveWhiteboard', { id, whiteboard }),
  openPanel: (type: 'notes' | 'whiteboard', id: number): Promise<void> =>
    ipcRenderer.invoke('panel:open', { type, id }),
  closeProblemPanels: (id: number): Promise<void> =>
    ipcRenderer.invoke('panel:closeForProblem', id),

  // ---- settings ----
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  resetSession: (): Promise<void> => ipcRenderer.invoke('app:resetSession'),
  clearLocalData: (): Promise<void> => ipcRenderer.invoke('app:clearLocalData'),
  openDataDir: (): Promise<void> => ipcRenderer.invoke('app:openDataDir'),
  chooseDataDir: (): Promise<string | null> => ipcRenderer.invoke('app:chooseDataDir'),
  pushSyncNow: (): Promise<
    { ok: true } | { ok: false; reason: 'not_configured' | 'busy' | 'failed'; message?: string }
  > => ipcRenderer.invoke('sync:pushNow'),

  compileAndRun: (
    problemId: number,
    source: string,
    input: string,
    ioFiles: ProblemIoFiles
  ): Promise<CompileRunResult> =>
    ipcRenderer.invoke('workspace:compileRun', { problemId, source, input, ioFiles }),
  submitSolution: (problemId: number, source: string): Promise<SubmitSolutionResult> =>
    ipcRenderer.invoke('workspace:submit', { problemId, source }),

  // ---- pbinfo webview control ----
  navigatePbinfo: (url: string): Promise<void> => ipcRenderer.invoke('pbinfo:navigate', url),
  getPbinfoNavState: (): Promise<PbinfoNavState> => ipcRenderer.invoke('pbinfo:navState'),
  pbinfoBack: (): Promise<void> => ipcRenderer.invoke('pbinfo:back'),
  pbinfoForward: (): Promise<void> => ipcRenderer.invoke('pbinfo:forward'),
  pbinfoReload: (): Promise<void> => ipcRenderer.invoke('pbinfo:reload'),
  setPbinfoBounds: (b: ViewBounds): void => ipcRenderer.send('pbinfo:setBounds', b),

  // ---- events (main -> renderer) ----
  onProblemDetected: (cb: (p: DetectedProblem) => void): (() => void) => {
    const h = (_: unknown, p: DetectedProblem): void => cb(p)
    ipcRenderer.on('detected-problem', h)
    return () => ipcRenderer.removeListener('detected-problem', h)
  },
  onVerdictDetected: (cb: (v: DetectedVerdict) => void): (() => void) => {
    const h = (_: unknown, v: DetectedVerdict): void => cb(v)
    ipcRenderer.on('detected-verdict', h)
    return () => ipcRenderer.removeListener('detected-verdict', h)
  },
  onNavState: (cb: (s: PbinfoNavState) => void): (() => void) => {
    const h = (_: unknown, s: PbinfoNavState): void => cb(s)
    ipcRenderer.on('pbinfo:nav-state', h)
    return () => ipcRenderer.removeListener('pbinfo:nav-state', h)
  },
  onDataChanged: (cb: () => void): (() => void) => {
    const h = (): void => cb()
    ipcRenderer.on('data:changed', h)
    return () => ipcRenderer.removeListener('data:changed', h)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
