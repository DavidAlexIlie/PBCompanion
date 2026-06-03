import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as db from './db'

const GIST_FILENAME = 'pbcompanion-sync.json'
const INTERVAL_MS = 10_000

interface SyncConfig {
  gistId: string
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false
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

async function pushSnapshot(): Promise<void> {
  if (running || !activeDataDir) return
  const config = readConfig(activeDataDir)
  if (!config) return
  running = true
  try {
    const snapshotPath = join(activeDataDir, GIST_FILENAME)
    writeFileSync(snapshotPath, JSON.stringify(db.exportSyncSnapshot(), null, 2), 'utf-8')
    await editGist(config.gistId, snapshotPath)
  } catch {
    // Sync is best-effort and must never interrupt local work.
  } finally {
    running = false
  }
}

function readConfig(dataDir: string): SyncConfig | null {
  try {
    const path = join(dataDir, 'github-sync.json')
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<SyncConfig>
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
