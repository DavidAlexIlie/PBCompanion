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
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { isCloudflareCookie } from './cookies'

interface StoredCookie {
  url: string
  name: string
  value: string
  domain?: string
  /** Set by the server for one exact host; must not come back domain-wide. */
  hostOnly?: boolean
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

/**
 * Whether a stored cookie should come back as host-only. New entries record
 * `hostOnly`; older ones don't, and a `.www.` domain in those is this app's
 * own past widening — the server sets that cookie on the bare host.
 */
function hostOnlyOnRestore(c: StoredCookie): boolean {
  if (c.hostOnly !== undefined) return c.hostOnly
  return (c.domain ?? '').startsWith('.www.')
}

/** pbinfo's login cookie: httpOnly, on pbinfo.ro, not Cloudflare's. */
function isPbinfoAuthCookie(c: { name: string; domain?: string; httpOnly?: boolean }): boolean {
  const domain = (c.domain ?? '').replace(/^\./, '').toLowerCase()
  return Boolean(c.httpOnly) && domain.endsWith('pbinfo.ro') && !isCloudflareCookie(c.name)
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
let loggedOut = false // the user ended the session on purpose
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
  await removeShadowCookies(ses) // repair damage from older builds
  await restore(ses, dataDir)
  // Again after restoring: a shadow left by an older build only becomes
  // detectable once its host-only twin is back.
  await removeShadowCookies(ses)

  // Save shortly after any cookie change...
  ses.cookies.on('changed', (_event, cookie, cause, removed) => {
    // An explicit logout must reach the backup, otherwise the next launch
    // restores the session the user just ended.
    if (removed && isPbinfoAuthCookie(cookie) && cause === 'explicit') loggedOut = true
    if (!removed && isPbinfoAuthCookie(cookie)) loggedOut = false
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

/**
 * Drop the encrypted mirror. Without this, "Reset session" would be undone by
 * the next launch restoring the backed-up login.
 */
export function clearSessionBackup(): void {
  loggedOut = true
  try {
    if (activeDir) rmSync(fileFor(activeDir), { force: true })
  } catch {
    /* nothing to remove */
  }
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
    // Drop `.host` duplicates first: a shadow that survives into the mirror
    // comes back on every launch and keeps logging the user out.
    await removeShadowCookies(ses)
    const cookies = await ses.cookies.get({})
    // Cloudflare clearance is tied to this machine and IP. Carrying it to
    // another PC (or a copied data folder) makes Cloudflare reject it and
    // challenge every request instead.
    const stored: StoredCookie[] = cookies
      .filter((c) => !isCloudflareCookie(c.name))
      .map((c) => ({
        url: cookieUrl(c),
        name: c.name,
        value: c.value,
        domain: c.domain,
        hostOnly: c.hostOnly ?? !(c.domain ?? '').startsWith('.'),
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: c.expirationDate,
        sameSite: c.sameSite
      }))

    // Never let a logged-out session erase a good backup: without this, one
    // launch that fails to restore the login destroys the only copy of it.
    if (!loggedOut && !stored.some(isPbinfoAuthCookie) && backupHasLogin(dataDir)) return
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

/**
 * Delete the `.host` duplicates an older build created while restoring
 * host-only cookies. Left in place they shadow the real login cookie.
 */
async function removeShadowCookies(ses: Electron.Session): Promise<void> {
  try {
    const cookies = await ses.cookies.get({})
    const hostOnlyNames = new Set(
      cookies.filter((c) => !(c.domain ?? '').startsWith('.')).map((c) => `${c.name}@${c.domain}`)
    )
    for (const c of cookies) {
      const domain = c.domain ?? ''
      if (!domain.startsWith('.')) continue
      // Only an exact duplicate of a host-only cookie is a shadow. pbinfo does
      // set real cookies on `.www.pbinfo.ro` (vizitator_track), so a leading
      // dot alone is never grounds for deleting one.
      if (!hostOnlyNames.has(`${c.name}@${domain.slice(1)}`)) continue
      try {
        await ses.cookies.remove(cookieUrl(c), c.name)
      } catch {
        /* best effort */
      }
    }
  } catch {
    /* best effort */
  }
}

/** Does the on-disk mirror still hold a usable login? */
function backupHasLogin(dataDir: string): boolean {
  try {
    const f = fileFor(dataDir)
    if (!existsSync(f)) return false
    const raw = readFileSync(f)
    let jsonText: string
    try {
      jsonText = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf-8')
    } catch {
      jsonText = raw.toString('utf-8')
    }
    const now = Date.now() / 1000
    return (JSON.parse(jsonText) as StoredCookie[]).some(
      (c) => isPbinfoAuthCookie(c) && (c.expirationDate === undefined || c.expirationDate > now)
    )
  } catch {
    return false
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
    const now = Date.now() / 1000
    for (const c of stored) {
      if (isCloudflareCookie(c.name)) continue // may come from an older mirror
      if (c.expirationDate !== undefined && c.expirationDate <= now) continue
      try {
        await ses.cookies.set({
          url: c.url,
          name: c.name,
          value: c.value,
          // A host-only cookie MUST stay host-only. Passing `domain` turns it
          // into a `.host` cookie, so the browser then sends two cookies with
          // the same name and pbinfo reads the wrong one — which logged the
          // user out on every launch. Entries written before this field
          // existed may already hold a widened `.www.` domain; restore those
          // host-only too, or an old mirror keeps re-creating the duplicate.
          domain: hostOnlyOnRestore(c) ? undefined : c.domain,
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
