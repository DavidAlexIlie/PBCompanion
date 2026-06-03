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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'

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

/** Restore cookies from disk into the partition, then keep the file in sync. */
export async function attachSessionPersistence(partition: string, dataDir: string): Promise<void> {
  const ses = session.fromPartition(partition)
  activeSes = ses
  activeDir = dataDir
  await restore(ses, dataDir)

  // Save shortly after any cookie change...
  ses.cookies.on('changed', () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void save(ses, dataDir), 1000)
  })
  // ...and on a steady cadence, so a fresh login is backed up within ~15s even
  // if the app is closed abruptly.
  setInterval(() => void save(ses, dataDir), 15000)
}

/** Force an immediate save (call on app quit). */
export async function flushSession(): Promise<void> {
  if (activeSes) await save(activeSes, activeDir)
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
    writeFileSync(fileFor(dataDir), blob)
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
          expirationDate: c.expirationDate,
          sameSite: c.sameSite
        })
      } catch {
        /* skip a cookie that won't set; others may still work */
      }
    }
  } catch {
    /* ignore corrupt/missing file */
  }
}
