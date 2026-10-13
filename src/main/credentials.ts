/**
 * credentials.ts — the user's pbinfo login, remembered on THIS machine only.
 *
 * Same trust model as sessionPersist.ts: the secret is encrypted at rest with
 * the OS keychain via Electron safeStorage and written to a file inside the
 * user's data folder. It never leaves the machine — the mobile/Gist sync only
 * uploads `pbcompanion-sync.json` (a DB snapshot), never this file — and it is
 * never exposed to our React renderer; only the main process and the pbinfo
 * webview (where the user types it anyway) ever hold the plaintext.
 */
import { safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'fs'

export interface StoredLogin {
  user: string
  secret: string
}

function fileFor(dataDir: string): string {
  return join(dataDir, 'pbinfo-login.bin')
}

export function hasLogin(dataDir: string): boolean {
  return existsSync(fileFor(dataDir))
}

export function saveLogin(dataDir: string, login: StoredLogin): void {
  try {
    if (!login.user || !login.secret) return
    const json = JSON.stringify(login)
    const blob = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf-8')
    mkdirSync(dataDir, { recursive: true })
    const target = fileFor(dataDir)
    const temp = `${target}.tmp`
    writeFileSync(temp, blob)
    renameSync(temp, target)
  } catch {
    /* non-fatal: autofill simply won't be available */
  }
}

export function loadLogin(dataDir: string): StoredLogin | null {
  try {
    const f = fileFor(dataDir)
    if (!existsSync(f)) return null
    const raw = readFileSync(f)
    let jsonText: string
    try {
      jsonText = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf-8')
    } catch {
      jsonText = raw.toString('utf-8') // file may be plaintext from a no-keychain run
    }
    const parsed = JSON.parse(jsonText) as Partial<StoredLogin>
    if (typeof parsed.user === 'string' && typeof parsed.secret === 'string') {
      return { user: parsed.user, secret: parsed.secret }
    }
    return null
  } catch {
    return null
  }
}

export function clearLogin(dataDir: string): void {
  try {
    rmSync(fileFor(dataDir), { force: true })
  } catch {
    /* nothing to remove */
  }
}
