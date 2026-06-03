/**
 * adblock.ts — a lightweight request blocker for the embedded browser session.
 *
 * Blocks Google ads / common ad & tracker domains so they don't clutter pbinfo
 * (and the Google login that happens in the same session). It deliberately does
 * NOT block auth/CDN hosts (accounts.google.com, gstatic.com, fonts, apis),
 * so signing in with Google keeps working.
 */
import { session } from 'electron'

// Hosts (and any subdomain of them) that get cancelled.
const BLOCKED = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'googletagservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'adservice.google.com',
  'adservice.google.ro',
  'pagead2.googlesyndication.com',
  'partner.googleadservices.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'adsystem.com',
  'moatads.com',
  'scorecardresearch.com',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'quantserve.com',
  'zedo.com'
]

function isBlocked(hostname: string): boolean {
  return BLOCKED.some((d) => hostname === d || hostname.endsWith('.' + d))
}

export function installAdblock(partition: string): void {
  const ses = session.fromPartition(partition)
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    try {
      const host = new URL(details.url).hostname
      if (isBlocked(host)) {
        cb({ cancel: true })
        return
      }
    } catch {
      /* malformed URL — let it through */
    }
    cb({})
  })
}
