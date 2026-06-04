/**
 * sessionPersist.ts — keep the pbinfo login alive across reinstalls.
 *
 * The webview already persists cookies in its `persist:` partition under
 * userData, but that can be wiped if the app is removed/redownloaded. To make
 * the login durable we also mirror the session cookies to a file in the user's
 * DATA folder (which they control and which survives reinstalls), encrypted
 * with the OS keychain via Electron safeStorage when available.
 *
 * On launch we restore those cookies into the partition; while running we
 * re-export (debounced) whenever cookies change.
 */
import { session, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'

interface StoredCookie {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

function fileFor(dataDir: string): string {
  return join(dataDir, 'pbinfo-session.bin')
}

function cookieUrl(c: Electron.Cookie): string {
  const domain = (c.domain ?? '').replace(/^\./, '')
  const scheme = c.secure ? 'https' : 'http'
  return `${scheme}://${domain}${c.path ?? '/'}`
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let activeSes: Electron.Session | null = null
let activeDir = ''
let periodicSave: ReturnType<typeof setInterval> | null = null
let runningSave: Promise<void> | null = null
let cookieChangedHandler: ((cookie: Electron.Cookie, cause: string, removed: boolean) => void) | null =
  null

/** Let the pbinfo view react immediately when authentication cookies change. */
export function onPbinfoCookieChanged(
  handler: (cookie: Electron.Cookie, cause: string, removed: boolean) => void
): void {
  cookieChangedHandler = handler
}

/** Restore cookies from disk into the partition, then keep the file in sync. */
export async function attachSessionPersistence(partition: string, dataDir: string): Promise<void> {
  const ses = session.fromPartition(partition)
  activeSes = ses
  activeDir = dataDir
  await restore(ses, dataDir)

  // Save shortly after any cookie change...
  ses.cookies.on('changed', (_event, cookie, cause, removed) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void queueSave(ses, dataDir), 250)
    cookieChangedHandler?.(cookie, cause, removed)
  })
  // ...and on a steady cadence, so a fresh login is backed up within ~5s even
  // if the app is closed abruptly.
  if (periodicSave) clearInterval(periodicSave)
  periodicSave = setInterval(() => void queueSave(ses, dataDir), 5000)
  await queueSave(ses, dataDir)
}

/** Force an immediate save (call on app quit). */
export async function flushSession(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  if (activeSes) await queueSave(activeSes, activeDir)
}

function queueSave(ses: Electron.Session, dataDir: string): Promise<void> {
  if (runningSave) return runningSave
  runningSave = save(ses, dataDir).finally(() => {
    runningSave = null
  })
  return runningSave
}

async function save(ses: Electron.Session, dataDir: string): Promise<void> {
  try {
    const cookies = await ses.cookies.get({})
    const stored: StoredCookie[] = cookies.map((c) => ({
      url: cookieUrl(c),
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      expirationDate: c.expirationDate,
      sameSite: c.sameSite
    }))
    const json = Buffer.from(JSON.stringify(stored), 'utf-8')
    const blob = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json.toString('utf-8')) : json
    mkdirSync(dataDir, { recursive: true })
    const target = fileFor(dataDir)
    const temp = `${target}.tmp`
    writeFileSync(temp, blob)
    renameSync(temp, target)
    // Ask Chromium to flush its persistent partition too. The encrypted mirror
    // remains the reinstall-safe backup; this keeps normal restarts reliable.
    await ses.flushStorageData()
  } catch {
    /* non-fatal: login will simply rely on the partition cache */
  }
}

async function restore(ses: Electron.Session, dataDir: string): Promise<void> {
  try {
    const f = fileFor(dataDir)
    if (!existsSync(f)) return
    const raw = readFileSync(f)
    let jsonText: string
    try {
      jsonText = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8')
    } catch {
      jsonText = raw.toString('utf-8') // file may be plaintext from a no-keychain run
    }
    const stored = JSON.parse(jsonText) as StoredCookie[]
    const persistentSessionExpiry = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
    for (const c of stored) {
      try {
        await ses.cookies.set({
          url: c.url,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          // pbinfo's login is normally a session cookie. Persist the restored
          // copy locally so Windows shutdown cannot remove it before the app
          // gets a chance to restore the encrypted mirror.
          expirationDate: c.expirationDate ?? persistentSessionExpiry,
          sameSite: c.sameSite
        })
      } catch {
        /* skip a cookie that won't set; others may still work */
      }
    }
    await ses.flushStorageData()
  } catch {
    /* ignore corrupt/missing file */
  }
}
