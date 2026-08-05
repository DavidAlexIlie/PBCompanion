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
import type { ViewBounds, PbinfoNavState, SubmitSolutionResult } from '../shared/types'
import { installAdblock } from './adblock'
import { clientHintBrands, desktopUserAgent, isChallengeUrl, isCloudflareCookie } from './cookies'

const PBINFO_HOME = 'https://www.pbinfo.ro/'
export const PARTITION = 'persist:pbinfo' // persisted to disk under userData -> session survives restarts

let view: WebContentsView | null = null
let win: BrowserWindow | null = null
let currentBounds: ViewBounds = { x: 0, y: 0, width: 0, height: 0, visible: false }
let authReloadTimer: ReturnType<typeof setTimeout> | null = null
let lastAuthReloadAt = 0
let lastProblemId: number | null = null
let pendingSubmission: unknown = null

export function rememberLastProblem(problemId: number): void {
  lastProblemId = problemId
}

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
  // Look like plain desktop Chrome. Cloudflare hands Electron's default user
  // agent a managed challenge that this view can't clear, which leaves a fresh
  // machine stuck on "Verificare eșuată".
  ses.setUserAgent(desktopUserAgent())
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, cb) => {
    const headers = { ...details.requestHeaders }
    if (headers['sec-ch-ua']) headers['sec-ch-ua'] = clientHintBrands()
    cb({ requestHeaders: headers })
  })

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

export async function submitSolution(
  problemId: number,
  sourceCode: string
): Promise<SubmitSolutionResult> {
  const wc = view?.webContents
  if (!wc || wc.isDestroyed()) return { ok: false, message: 'pbinfo browser is not available.' }
  if (lastProblemId !== problemId) {
    return {
      ok: false,
      message: 'Open this exact problem in the pbinfo browser before submitting.'
    }
  }
  try {
    if (!wc.getURL().includes(`/probleme/${problemId}`)) {
      return { ok: false, message: 'The pbinfo browser is no longer on the selected problem.' }
    }
    const result = (await wc.executeJavaScript(`
      (() => {
        const form = document.querySelector('#form-incarcare-solutie');
        const textarea = form?.querySelector('textarea[name="sursa"]');
        const button = form?.querySelector('#btn-submit');
        if (!form || !textarea || !button) {
          return { ok: false, message: 'Submission form not found. Make sure you are logged in.' };
        }
        const source = ${JSON.stringify(sourceCode)};
        const cm = form.querySelector('.CodeMirror')?.CodeMirror;
        if (cm?.setValue) cm.setValue(source);
        textarea.value = source;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        button.click();
        return { ok: true };
      })()
    `)) as SubmitSolutionResult
    return result
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Submission failed.' }
  }
}

/**
 * pbinfo's login dialog confirms success after setting its session cookie, but
 * the surrounding page can keep rendering the old logged-out navigation until
 * the next app launch. Reload once after a likely authentication-cookie update
 * so the current view immediately consumes the new session.
 */
export function handleCookieChanged(
  cookie: Electron.Cookie,
  cause: string,
  removed: boolean
): void {
  const domain = (cookie.domain ?? '').replace(/^\./, '').toLowerCase()
  if (removed || !domain.endsWith('pbinfo.ro')) return
  // Cloudflare's cookies are httpOnly too, and it rewrites them on every step
  // of a verification challenge. Reloading then restarts the challenge, which
  // is an endless "Verificare eșuată" loop on any machine that gets challenged.
  if (isCloudflareCookie(cookie.name)) return
  const likelyAuthCookie =
    cookie.httpOnly || /(?:session|sess|auth|login|user|token|php)/i.test(cookie.name)
  if (!likelyAuthCookie || !['explicit', 'overwrite'].includes(cause)) return
  if (!view || view.webContents.isDestroyed()) return
  if (Date.now() - lastAuthReloadAt < 5000) return
  if (authReloadTimer) clearTimeout(authReloadTimer)
  authReloadTimer = setTimeout(() => {
    authReloadTimer = null
    const wc = view?.webContents
    if (!wc || wc.isDestroyed()) return
    // Never interrupt a challenge or a page that is still loading.
    if (wc.isLoading() || isChallengeUrl(wc.getURL())) return
    lastAuthReloadAt = Date.now()
    wc.reload()
  }, 700)
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
  ipcMain.on('pbinfo:pending-submit', (_e, payload) => {
    pendingSubmission = payload
  })
  ipcMain.handle('pbinfo:get-pending-submit', () => pendingSubmission)
}

export function injectPreloadPath(): string {
  // Preloads are emitted next to the main bundle: out/preload/inject.js
  return join(__dirname, '../preload/inject.js')
}
