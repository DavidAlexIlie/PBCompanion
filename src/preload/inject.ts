/**
 * inject.ts — PRELOAD INJECTED INTO THE pbinfo WEBVIEW.
 *
 * This is the fragile, critical half of the bridge. It runs inside every
 * pbinfo page (its own webContents), reads ONLY the page the user is already
 * looking at, and reports structured data to the main process over IPC.
 * Main then forwards it to our React UI.
 *
 * Boundaries honored here:
 *   - Reads only the currently-open page (the user's own view). No crawling,
 *     no background fetching of other problems, no automated submissions.
 *   - Every DOM read is defensive (selectors live in pbinfoSelectors.ts).
 *
 * Channels (renderer -> main):
 *   'pbinfo:problem-detected'  DetectedProblem
 *   'pbinfo:verdict-detected'  DetectedVerdict
 *   'pbinfo:page-changed'      { url }
 */
import { ipcRenderer } from 'electron'
import {
  parseProblemUrl,
  isProblemPage,
  extractTitle,
  extractStatementHtml,
  extractScore,
  extractSourceCode
} from './pbinfoSelectors'
import { cleanProblemName } from '../shared/text'

const log = (...a: unknown[]): void => console.debug('[pbinfo-inject]', ...a)

function reportProblem(): void {
  try {
    const href = location.href
    const parsed = parseProblemUrl(href)
    if (!parsed) return
    const title = cleanProblemName(extractTitle(document) ?? parsed.slug, parsed.id, parsed.slug)
    const statementHtml = extractStatementHtml(document)
    ipcRenderer.send('pbinfo:problem-detected', {
      id: parsed.id,
      slug: parsed.slug,
      title,
      url: href,
      statementHtml
    })
    log('problem detected', parsed.id, title)
  } catch (err) {
    log('reportProblem failed (non-fatal)', err)
  }
}

let lastReportedScore: { problemId: number; score: number } | null = null

function reportVerdict(): void {
  try {
    // A verdict only makes sense in the context of a known problem id. Use the
    // current URL when it's a problem page; otherwise skip (we don't guess).
    const parsed = parseProblemUrl(location.href)
    if (!parsed) return
    const score = extractScore(document)
    if (score === null) return
    // Debounce identical readings so a re-render doesn't spam attempts.
    if (
      lastReportedScore &&
      lastReportedScore.problemId === parsed.id &&
      lastReportedScore.score === score
    ) {
      return
    }
    lastReportedScore = { problemId: parsed.id, score }
    const sourceCode = extractSourceCode(document)
    ipcRenderer.send('pbinfo:verdict-detected', {
      problemId: parsed.id,
      score,
      sourceCode,
      timestamp: new Date().toISOString()
    })
    log('verdict detected', parsed.id, score, sourceCode ? '(code captured)' : '(no code)')
  } catch (err) {
    log('reportVerdict failed (non-fatal)', err)
  }
}

function scan(): void {
  reportProblem()
  reportVerdict()
}

function announcePage(): void {
  try {
    ipcRenderer.send('pbinfo:page-changed', { url: location.href })
  } catch {
    /* ignore */
  }
}

function init(): void {
  announcePage()
  scan()

  // Watch for verdicts / late-rendered statements appearing in the DOM.
  // Constrained to subtree text changes; debounced.
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      if (isProblemPage(location.href)) scan()
    }, 600)
  }
  try {
    const obs = new MutationObserver(schedule)
    obs.observe(document.documentElement, { childList: true, subtree: true })
  } catch (err) {
    log('MutationObserver unavailable (non-fatal)', err)
  }

  // pbinfo is mostly classic navigation, but guard against history API usage.
  window.addEventListener('popstate', () => {
    announcePage()
    scan()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
