/**
 * cookies.ts — shared cookie rules for the embedded pbinfo session.
 *
 * Cloudflare's bot-management cookies (`cf_clearance`, `__cf_bm`, `_cfuvid`, …)
 * are httpOnly on `.pbinfo.ro`, which makes them look exactly like a login
 * cookie. They must be handled separately: reloading when they change breaks
 * the verification challenge, and copying them between machines makes
 * Cloudflare reject them.
 */
export function isCloudflareCookie(name: string): boolean {
  return /^(cf_|__cf|_cf)/i.test(name)
}

/** True for a page that is currently running a Cloudflare challenge. */
export function isChallengeUrl(url: string): boolean {
  return url.includes('/cdn-cgi/') || url.includes('__cf_chl')
}

/**
 * A plain desktop-Chrome user agent. Electron's default advertises
 * `PBCompanion/x Electron/y`, which Cloudflare answers with a managed
 * challenge that the embedded view can rarely clear.
 */
export function desktopUserAgent(): string {
  const major = (process.versions.chrome ?? '130').split('.')[0]
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

/** Client hints must agree with the user agent above. */
export function clientHintBrands(): string {
  const major = (process.versions.chrome ?? '130').split('.')[0]
  return `"Chromium";v="${major}", "Google Chrome";v="${major}", "Not?A_Brand";v="24"`
}
