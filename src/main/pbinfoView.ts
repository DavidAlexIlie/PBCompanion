/**
 * pbinfoView.ts — the embedded pbinfo browser.
 *
 * We use a WebContentsView (not the deprecated <webview> tag) layered over the
 * React renderer. The renderer reserves a blank region and reports its pixel
 * rect; we position the view there. A `persist:` session partition keeps the
 * user logged in across app restarts — they log in once, on the real site.
 *
 * The inject preload (src/preload/inject.ts) runs inside this view and is the
 * only thing that reads pbinfo's DOM.
 */
import { WebContentsView, BrowserWindow, session, ipcMain } from 'electron'
import { join } from 'path'
import type { ViewBounds, PbinfoNavState } from '../shared/types'
import { installAdblock } from './adblock'

const PBINFO_HOME = 'https://www.pbinfo.ro/'
export const PARTITION = 'persist:pbinfo' // persisted to disk under userData -> session survives restarts

let view: WebContentsView | null = null
let win: BrowserWindow | null = null
let currentBounds: ViewBounds = { x: 0, y: 0, width: 0, height: 0, visible: false }

export function getNavState(): PbinfoNavState {
  if (!view) return { url: '', canGoBack: false, canGoForward: false, loading: false }
  const wc = view.webContents
  return {
    url: wc.getURL(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    loading: wc.isLoading()
  }
}

function pushNavState(): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send('pbinfo:nav-state', getNavState())
}

export function createPbinfoView(parent: BrowserWindow, injectPreloadPath: string): WebContentsView {
  win = parent
  installAdblock(PARTITION) // block ads/trackers in the embedded browser session
  const ses = session.fromPartition(PARTITION)

  view = new WebContentsView({
    webPreferences: {
      preload: injectPreloadPath,
      session: ses,
      contextIsolation: true,
      sandbox: false, // inject preload needs `require('electron')` for ipcRenderer
      nodeIntegration: false
    }
  })

  parent.contentView.addChildView(view)
  view.setVisible(false)

  const wc = view.webContents
  // Keep popups inside the same view rather than spawning OS windows.
  wc.setWindowOpenHandler(({ url }) => {
    wc.loadURL(url)
    return { action: 'deny' }
  })
  wc.on('did-navigate', pushNavState)
  wc.on('did-navigate-in-page', pushNavState)
  wc.on('did-finish-load', pushNavState)
  wc.on('did-start-loading', pushNavState)
  wc.on('did-stop-loading', pushNavState)

  wc.loadURL(PBINFO_HOME)
  return view
}

export function applyBounds(b: ViewBounds): void {
  if (!view) return
  const wasVisible = currentBounds.visible
  currentBounds = b
  view.setVisible(b.visible)
  if (b.visible) {
    view.setBounds({
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: Math.max(0, Math.round(b.width)),
      height: Math.max(0, Math.round(b.height))
    })
    // Becoming visible again (e.g. after Hide → Browse): the toolbar remounted
    // with stale nav state, so re-push the real back/forward availability.
    if (!wasVisible) pushNavState()
  }
}

export function reapplyBounds(): void {
  applyBounds(currentBounds)
}

export function navigate(url: string): void {
  view?.webContents.loadURL(url)
}

export function goBack(): void {
  const wc = view?.webContents
  if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
}

export function goForward(): void {
  const wc = view?.webContents
  if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
}

export function reload(): void {
  view?.webContents.reload()
}

export async function clearPbinfoSession(): Promise<void> {
  await session.fromPartition(PARTITION).clearStorageData()
}

/**
 * Wire the inject-script IPC (renderer side = pbinfo view) through to our
 * React renderer, and let main act on verdicts. `onVerdict` lets index.ts
 * persist attempts / apply scores.
 */
export function wireInjectBridge(
  mainWindow: BrowserWindow,
  handlers: {
    onProblemDetected: (p: unknown) => void
    onVerdict: (v: unknown) => void
  }
): void {
  ipcMain.on('pbinfo:problem-detected', (_e, payload) => {
    handlers.onProblemDetected(payload)
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('detected-problem', payload)
  })
  ipcMain.on('pbinfo:verdict-detected', (_e, payload) => {
    handlers.onVerdict(payload)
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('detected-verdict', payload)
  })
  ipcMain.on('pbinfo:page-changed', () => pushNavState())
}

export function injectPreloadPath(): string {
  // Preloads are emitted next to the main bundle: out/preload/inject.js
  return join(__dirname, '../preload/inject.js')
}
