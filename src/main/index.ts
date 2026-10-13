import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import * as db from './db'
import * as settings from './settings'
import * as pb from './pbinfoView'
import {
  attachSessionPersistence,
  clearSessionBackup,
  flushSession,
  onPbinfoCookieChanged,
  onPbinfoAuthLogin
} from './sessionPersist'
import { openPanel, closeProblemPanels } from './panels'
import { ensureGroupFolder, renameGroupFolder } from './groupFolders'
import { pushSnapshot, startDesktopSync, stopDesktopSync } from './sync'
import { compileAndRun } from './compiler'
import { hasLogin, saveLogin, loadLogin, clearLogin, type StoredLogin } from './credentials'
import type {
  ViewBounds,
  UserStatus,
  DetectedProblem,
  DetectedVerdict,
  ProblemIoFiles,
  AppSettings,
  ThemeName
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

// A login the user just typed in the pbinfo webview. Held only until pbinfo
// confirms it (its auth cookie is set) and the user answers the "save it?"
// prompt. Never written to disk until they say yes, and never sent to our React
// UI (only the username is, to label the prompt).
let pendingLogin: StoredLogin | null = null
let pendingLoginTimer: ReturnType<typeof setTimeout> | null = null
let loginOfferDismissed = false // "Not now" silences the prompt for this run

// A login attempt is only worth offering if pbinfo accepts it within a short
// window. After that, assume it failed/was abandoned and forget the attempt.
const LOGIN_CONFIRM_WINDOW_MS = 30_000

function dataDir(): string {
  return settings.getSettings().dataDir
}

/** The pbinfo webview reports a login the user just submitted (not yet accepted). */
function onLoginAttempt(login: StoredLogin): void {
  if (!login?.user || !login?.secret) return
  if (!settings.getSettings().rememberLogin) return
  pendingLogin = login
  if (pendingLoginTimer) clearTimeout(pendingLoginTimer)
  pendingLoginTimer = setTimeout(() => {
    pendingLogin = null
    pendingLoginTimer = null
  }, LOGIN_CONFIRM_WINDOW_MS)
}

/** pbinfo set its auth cookie — the pending login (if any) actually succeeded. */
function onLoginConfirmed(): void {
  const login = pendingLogin
  if (!login) return
  pendingLogin = null
  if (pendingLoginTimer) {
    clearTimeout(pendingLoginTimer)
    pendingLoginTimer = null
  }
  if (!settings.getSettings().rememberLogin) return
  const stored = loadLogin(dataDir())
  if (stored && stored.user === login.user && stored.secret === login.secret) return // unchanged
  if (stored && stored.user === login.user) {
    // Same account, new password: quietly keep the saved copy current.
    saveLogin(dataDir(), login)
    mainWindow?.webContents.send('login:saved', { user: login.user, updated: true })
    return
  }
  // Hold it so the user can accept via the prompt.
  pendingLogin = login
  if (!loginOfferDismissed) mainWindow?.webContents.send('login:offer', { user: login.user })
}

function notifyDataChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:changed')
}

/** Paint the native window frame in the theme colour so startup doesn't flash. */
export function shellBackground(theme: ThemeName): string {
  return theme === 'dark' ? '#212529' : '#f8fafc'
}

export function panelBackground(theme: ThemeName): string {
  return theme === 'dark' ? '#343a40' : '#ffffff'
}

/** Settings changes reach every window (main + pop-out panels). */
function notifySettingsChanged(next: AppSettings): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('settings:changed', next)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: shellBackground(settings.getSettings().theme),
    title: 'PBCompanion',
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  // Embedded pbinfo browser (layered above the renderer, positioned by it).
  pb.createPbinfoView(mainWindow, pb.injectPreloadPath())
  pb.wireInjectBridge(mainWindow, {
    onProblemDetected: (payload) => {
      // Refresh cached metadata for problems we already know (keeps title/
      // statement fresh). New problems are only created via the Start buttons.
      const p = payload as DetectedProblem
      pb.rememberLastProblem(p.id)
      if (db.getProblem(p.id)) {
        db.refreshProblemMeta(p)
        notifyDataChanged()
      }
    },
    onVerdict: (payload) => {
      const v = payload as DetectedVerdict
      const known = db.getProblem(v.problemId)
      if (!known) return // only track verdicts for problems the user registered
      if (v.score !== null) {
        const s = settings.getSettings()
        db.addAttempt(v.problemId, v.sourceCode, v.score, v.timestamp)
        if (s.keepOnlyBest) db.keepOnlyBestAttempts()
        db.applyDetectedScore(v.problemId, {
          autoMove: s.autoMoveOnHundred,
          completedThreshold: s.bandCompleted
        })
        notifyDataChanged()
      }
    }
  })

  // Reposition the embedded view when the window resizes.
  mainWindow.on('resize', () => pb.reapplyBounds())
  // Windows can terminate apps during sign-out/shutdown without waiting for
  // Electron's normal before-quit path. Start the cookie flush immediately.
  mainWindow.on('session-end', () => {
    void flushSession()
  })
  mainWindow.on('closed', () => (mainWindow = null))

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  // ---- problems ----
  ipcMain.handle('problems:list', () => db.listProblems())
  ipcMain.handle('problems:register', (_e, p: DetectedProblem) => {
    const out = db.registerProblem(p)
    notifyDataChanged()
    return out
  })
  ipcMain.handle(
    'problems:setStatus',
    (_e, { id, status, sortIndex }: { id: number; status: UserStatus; sortIndex?: number }) => {
      db.setProblemStatus(id, status, sortIndex)
      notifyDataChanged()
    }
  )
  ipcMain.handle('problems:reorder', (_e, { orderedIds }: { orderedIds: number[] }) => {
    db.reorderProblems(orderedIds)
    notifyDataChanged()
  })
  ipcMain.handle('problems:delete', (_e, id: number) => {
    db.deleteProblem(id)
    notifyDataChanged()
  })
  ipcMain.handle('problems:setMarked', (_e, { id, marked }: { id: number; marked: boolean }) => {
    db.setProblemMarked(id, marked)
    notifyDataChanged()
  })

  // ---- per-problem notes + whiteboard ----
  ipcMain.handle('doc:get', (_e, id: number) => db.getProblemDoc(id))
  ipcMain.handle('doc:saveNotes', (_e, { id, notes }: { id: number; notes: string }) =>
    db.saveProblemNotes(id, notes)
  )
  ipcMain.handle(
    'doc:saveWhiteboard',
    (_e, { id, whiteboard }: { id: number; whiteboard: string }) =>
      db.saveProblemWhiteboard(id, whiteboard)
  )
  ipcMain.handle('panel:open', (_e, { type, id }: { type: 'notes' | 'whiteboard'; id: number }) => {
    if (mainWindow)
      openPanel(mainWindow, type, id, join(__dirname, '../preload/index.js'), {
        backgroundColor: panelBackground(settings.getSettings().theme)
      })
  })
  ipcMain.handle('panel:closeForProblem', (_e, id: number) => closeProblemPanels(id))

  // ---- attempts ----
  ipcMain.handle('attempts:list', (_e, problemId: number) => db.listAttempts(problemId))
  ipcMain.handle('attempts:delete', (_e, attemptId: number) => {
    const problemId = db.deleteAttempt(attemptId)
    // The problem's score is derived from its attempts — recompute so deleting
    // attempts lowers (or clears) the score instead of leaving it stale.
    if (problemId !== null) db.recomputeDetectedScore(problemId)
    notifyDataChanged()
  })
  ipcMain.handle(
    'attempts:addManual',
    (
      _e,
      { problemId, score, sourceCode }: { problemId: number; score: number; sourceCode: string | null }
    ) => {
      // A user-entered score/code is recorded as a normal attempt, so the
      // derived score and the attempts list both reflect it.
      db.addAttempt(problemId, sourceCode, score, new Date().toISOString())
      const s = settings.getSettings()
      db.applyDetectedScore(problemId, {
        autoMove: s.autoMoveOnHundred,
        completedThreshold: s.bandCompleted
      })
      notifyDataChanged()
    }
  )

  // ---- groups ----
  ipcMain.handle('groups:list', () => db.listGroups())
  ipcMain.handle('groups:create', (_e, g: { name: string; color: string; icon: string }) => {
    const folder = ensureGroupFolder(settings.getSettings().dataDir, g.name)
    const created = db.createGroup(g.name, g.color, g.icon, folder)
    notifyDataChanged()
    return { ...created, problemIds: [] }
  })
  ipcMain.handle(
    'groups:update',
    (_e, { id, name, color, icon }: { id: number; name?: string; color?: string; icon?: string }) => {
      if (name !== undefined) {
        const g = db.getGroup(id)
        const newPath = renameGroupFolder(settings.getSettings().dataDir, g?.folder_path ?? null, name)
        db.updateGroup(id, { name, color, icon })
        if (g) {
          db.getDb().prepare('UPDATE groups SET folder_path=? WHERE id=?').run(newPath, id)
        }
      } else {
        db.updateGroup(id, { color, icon })
      }
      notifyDataChanged()
    }
  )
  ipcMain.handle('groups:delete', (_e, id: number) => {
    db.deleteGroup(id) // folder on disk is intentionally left in place (non-destructive)
    notifyDataChanged()
  })
  ipcMain.handle('groups:addProblem', (_e, { groupId, problemId }: { groupId: number; problemId: number }) => {
    db.addProblemToGroup(groupId, problemId)
    notifyDataChanged()
  })
  ipcMain.handle(
    'groups:removeProblem',
    (_e, { groupId, problemId }: { groupId: number; problemId: number }) => {
      db.removeProblemFromGroup(groupId, problemId)
      notifyDataChanged()
    }
  )

  // ---- settings ----
  ipcMain.handle('settings:get', () => settings.getSettings())
  ipcMain.handle('settings:set', (_e, patch) => {
    const out = settings.setSettings(patch)
    if (patch.keepOnlyBest === true) db.keepOnlyBestAttempts()
    if (patch.theme !== undefined) {
      mainWindow?.setBackgroundColor(shellBackground(out.theme))
      for (const w of BrowserWindow.getAllWindows()) {
        if (w !== mainWindow && !w.isDestroyed()) w.setBackgroundColor(panelBackground(out.theme))
      }
    }
    notifySettingsChanged(out)
    notifyDataChanged()
    return out
  })
  ipcMain.handle('sync:pushNow', () => pushSnapshot(true))
  ipcMain.handle(
    'workspace:compileRun',
    (
      _e,
      {
        problemId,
        source,
        input,
        ioFiles
      }: { problemId: number; source: string; input: string; ioFiles: ProblemIoFiles }
    ) => compileAndRun(settings.getSettings().dataDir, problemId, source, input, ioFiles)
  )
  ipcMain.handle(
    'workspace:submit',
    (_e, { problemId, source }: { problemId: number; source: string }) =>
      pb.submitSolution(problemId, source)
  )
  ipcMain.handle('app:resetSession', async () => {
    clearSessionBackup() // otherwise the next launch restores the old login
    await pb.clearPbinfoSession()
    pb.navigate('https://www.pbinfo.ro/')
  })
  ipcMain.handle('app:clearLocalData', () => {
    db.clearOrganizerData()
    notifyDataChanged()
  })
  // DEV: wipe everything so the next launch is a clean first-run — used while
  // building the onboarding tutorial, to replay the new-user experience.
  ipcMain.handle('app:devReset', async () => {
    db.clearOrganizerData()
    clearLogin(dataDir())
    clearSessionBackup() // otherwise the next launch restores the old login
    pendingLogin = null
    loginOfferDismissed = false
    await pb.clearPbinfoSession()
    pb.navigate('https://www.pbinfo.ro/')
    notifyDataChanged()
  })
  ipcMain.handle('app:openDataDir', () => {
    shell.openPath(settings.getSettings().dataDir)
  })
  ipcMain.handle('app:chooseDataDir', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose data folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    settings.writeBootConfig({ dataDir: res.filePaths[0] })
    db.initDb(res.filePaths[0])
    startDesktopSync(res.filePaths[0])
    notifyDataChanged()
    return res.filePaths[0]
  })

  // ---- saved pbinfo login (local, encrypted) ----
  // creds:get is for the pbinfo webview's autofill only. It is deliberately
  // NOT part of window.api, so our React renderer can never read the secret.
  ipcMain.handle('creds:get', () =>
    settings.getSettings().rememberLogin ? loadLogin(dataDir()) : null
  )
  ipcMain.handle('creds:has', () => hasLogin(dataDir()))
  ipcMain.handle('creds:confirmSave', () => {
    if (!pendingLogin) return false
    saveLogin(dataDir(), pendingLogin)
    const user = pendingLogin.user
    pendingLogin = null
    mainWindow?.webContents.send('login:saved', { user, updated: false })
    return true
  })
  ipcMain.handle('creds:dismissOffer', () => {
    pendingLogin = null
    loginOfferDismissed = true
  })
  ipcMain.handle('creds:clear', () => {
    clearLogin(dataDir())
    pendingLogin = null
  })
  ipcMain.on('pbinfo:login-attempt', (_e, login: StoredLogin) => onLoginAttempt(login))

  // ---- pbinfo webview control ----
  ipcMain.handle('pbinfo:navState', () => pb.getNavState())
  ipcMain.handle('pbinfo:navigate', (_e, url: string) => pb.navigate(url))
  ipcMain.handle('pbinfo:back', () => pb.goBack())
  ipcMain.handle('pbinfo:forward', () => pb.goForward())
  ipcMain.handle('pbinfo:reload', () => pb.reload())
  ipcMain.on('pbinfo:setBounds', (_e, b: ViewBounds) => pb.applyBounds(b))
}

app.whenReady().then(async () => {
  const boot = settings.readBootConfig()
  db.initDb(boot.dataDir)
  // Restore a durable login (cookies mirrored to the data folder) before the
  // webview loads, so the user stays signed in across reinstalls.
  onPbinfoCookieChanged(pb.handleCookieChanged)
  onPbinfoAuthLogin(onLoginConfirmed) // offer to save a login only once pbinfo accepts it
  await attachSessionPersistence(pb.PARTITION, boot.dataDir)
  startDesktopSync(boot.dataDir)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Best-effort flush of the login backup before quitting.
app.on('before-quit', (e) => {
  e.preventDefault()
  stopDesktopSync()
  flushSession().finally(() => {
    app.removeAllListeners('before-quit')
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
