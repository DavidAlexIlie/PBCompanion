import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import * as db from './db'
import * as settings from './settings'
import * as pb from './pbinfoView'
import { attachSessionPersistence, flushSession, onPbinfoCookieChanged } from './sessionPersist'
import { openPanel, closeProblemPanels } from './panels'
import { ensureGroupFolder, renameGroupFolder } from './groupFolders'
import { startDesktopSync, stopDesktopSync } from './sync'
import type { ViewBounds, UserStatus, DetectedProblem, DetectedVerdict } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function notifyDataChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:changed')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: '#f8fafc',
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
      // statement fresh). New problems are only created via the NEW button.
      const p = payload as DetectedProblem
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
    if (mainWindow) openPanel(mainWindow, type, id, join(__dirname, '../preload/index.js'))
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
    notifyDataChanged()
    return out
  })
  ipcMain.handle('app:resetSession', async () => {
    await pb.clearPbinfoSession()
    pb.navigate('https://www.pbinfo.ro/')
  })
  ipcMain.handle('app:clearLocalData', () => {
    db.clearOrganizerData()
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
    notifyDataChanged()
    return res.filePaths[0]
  })

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
