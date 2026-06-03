import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as db from './db'

const GIST_FILENAME = 'pbcompanion-sync.json'
const INTERVAL_MS = 10_000

interface SyncConfig {
  gistId: string
}

export type SyncResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'busy' | 'failed'; message?: string }

let timer: ReturnType<typeof setInterval> | null = null
let running = false
let runningPush: Promise<SyncResult> | null = null
let activeDataDir = ''

export function startDesktopSync(dataDir: string): void {
  activeDataDir = dataDir
  if (timer) clearInterval(timer)
  void pushSnapshot()
  timer = setInterval(() => void pushSnapshot(), INTERVAL_MS)
}

export function stopDesktopSync(): void {
  if (timer) clearInterval(timer)
  timer = null
}

export async function pushSnapshot(forceAfterCurrent = false): Promise<SyncResult> {
  if (runningPush) {
    if (!forceAfterCurrent) return { ok: false, reason: 'busy' }
    await runningPush
  }
  runningPush = performPush()
  try {
    return await runningPush
  } finally {
    runningPush = null
  }
}

async function performPush(): Promise<SyncResult> {
  if (!activeDataDir) return { ok: false, reason: 'not_configured' }
  const config = readConfig(activeDataDir)
  if (!config) return { ok: false, reason: 'not_configured' }
  running = true
  try {
    const snapshotPath = join(activeDataDir, GIST_FILENAME)
    writeFileSync(snapshotPath, JSON.stringify(db.exportSyncSnapshot(), null, 2), 'utf-8')
    await editGist(config.gistId, snapshotPath)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      reason: 'failed',
      message: error instanceof Error ? error.message : 'Unknown sync error'
    }
  } finally {
    running = false
  }
}

function readConfig(dataDir: string): SyncConfig | null {
  try {
    const path = join(dataDir, 'github-sync.json')
    if (!existsSync(path)) return null
    const text = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(text) as Partial<SyncConfig>
    return typeof parsed.gistId === 'string' && parsed.gistId ? { gistId: parsed.gistId } : null
  } catch {
    return null
  }
}

function editGist(gistId: string, snapshotPath: string): Promise<void> {
  const gh = existsSync('C:\\Program Files\\GitHub CLI\\gh.exe')
    ? 'C:\\Program Files\\GitHub CLI\\gh.exe'
    : 'gh'
  return new Promise((resolve, reject) => {
    execFile(
      gh,
      ['gist', 'edit', gistId, '--filename', GIST_FILENAME, snapshotPath],
      { windowsHide: true },
      (error) => (error ? reject(error) : resolve())
    )
  })
}
