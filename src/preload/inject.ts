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
  extractSourceCode,
  extractLatestSubmissionVerdict,
  extractLatestSubmissionId,
  extractDetailedEvaluationScore
} from './pbinfoSelectors'
import { cleanProblemName } from '../shared/text'

const log = (...a: unknown[]): void => console.debug('[pbinfo-inject]', ...a)

function reportProblem(): void {
  try {
    const href = location.href
    const parsed = parseProblemUrl(href)
    if (!parsed) return
    lastProblemId = parsed.id // remember context for verdicts on other pages
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

let lastProblemId: number | null = null

// A problem already solved in the past shows its historic best score in the
// page (e.g. "100 de puncte") even when the user is just browsing. Reading that
// and recording it as a fresh attempt is wrong (and tends to grab garbage like
// a lone line-number for "code"). So we ONLY record a verdict that follows a
// submission WE observed: the submit handler stashes the editor's code + the
// problem id in sessionStorage (survives the post-submit navigation), and the
// verdict reader consumes it exactly once when the score appears.
const PENDING_KEY = 'pbcompanion:pendingSubmit'
const PENDING_TTL_MS = 30 * 60 * 1000 // evaluation can sit in a queue a while

interface PendingSubmit {
  problemId: number
  code: string | null
  t: number
  previousSubmissionId: string | null
  activeSubmissionId?: string | null
}

/** Stash "the user just submitted on this problem" + a code snapshot. */
function rememberSubmission(): void {
  try {
    const problemId = parseProblemUrl(location.href)?.id ?? lastProblemId
    if (problemId == null) return
    const code = extractSourceCode(document)
    const existing = readPending(problemId)
    const pending: PendingSubmit = {
      problemId,
      code: code ?? existing?.code ?? null,
      t: Date.now(),
      // A normal click produces both click and submit events. Preserve the
      // row id captured by the first event in case pbinfo mutates immediately.
      previousSubmissionId:
        existing && Date.now() - existing.t < 2000
          ? existing.previousSubmissionId
          : extractLatestSubmissionId(document)
    }
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    log('submission observed', problemId, code ? '(code snapshot)' : '(no code)')
  } catch (err) {
    log('rememberSubmission failed (non-fatal)', err)
  }
}

function writePending(pending: PendingSubmit): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    /* ignore */
  }
}

function readPending(problemId: number): PendingSubmit | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PendingSubmit
    if (p.problemId !== problemId) return null
    if (Date.now() - p.t > PENDING_TTL_MS) {
      sessionStorage.removeItem(PENDING_KEY)
      return null
    }
    return p
  } catch {
    return null
  }
}

/** True while pbinfo says the submission is still being graded. */
function evaluationInProgress(): boolean {
  const body = document.body?.textContent || ''
  return /curs de evaluare|se evalueaz|în așteptare|in asteptare|în curs|in curs|pending|waiting/i.test(
    body
  )
}

function reportVerdict(): void {
  try {
    const fromUrl = parseProblemUrl(location.href)?.id ?? null
    const problemId = fromUrl ?? lastProblemId
    if (problemId == null) return
    // No submission we saw → this is a historic score being displayed; ignore.
    const pending = readPending(problemId)
    if (!pending) return
    // Wait until pbinfo inserts a new first row. This proves the pending marker
    // corresponds to an accepted submission, not just a click or an old page.
    const currentSubmissionId = extractLatestSubmissionId(document)
    if (
      pending.previousSubmissionId &&
      (!currentSubmissionId || currentSubmissionId === pending.previousSubmissionId)
    ) {
      return
    }

    // pbinfo leaves old completed attempts visible while the newest one is
    // pending. Prefer only the newest row and never reuse an older row's score.
    const latest = extractLatestSubmissionVerdict(document)
    if (latest?.pending) {
      if (currentSubmissionId && pending.activeSubmissionId !== currentSubmissionId) {
        pending.activeSubmissionId = currentSubmissionId
        writePending(pending)
      }
      const detailed =
        pending.activeSubmissionId === currentSubmissionId
          ? extractDetailedEvaluationScore(document)
          : null
      if (detailed === null) return
      finishVerdict(problemId, detailed, pending)
      return
    }
    if (!latest && evaluationInProgress()) return
    const score = latest?.score ?? extractDetailedEvaluationScore(document) ?? extractScore(document)
    if (score === null) return // keep the pending marker and retry when it shows
    finishVerdict(problemId, score, pending)
  } catch (err) {
    log('reportVerdict failed (non-fatal)', err)
  }
}

function finishVerdict(problemId: number, score: number, pending: PendingSubmit): void {
  // The submit-time snapshot is tied to this attempt. Page-level code after
  // evaluation may be an example, official solution, or historical source.
  const sourceCode = pending.code ?? extractSourceCode(document)
  sessionStorage.removeItem(PENDING_KEY) // consume once
  ipcRenderer.send('pbinfo:verdict-detected', {
    problemId,
    score,
    sourceCode,
    timestamp: new Date().toISOString()
  })
  log('verdict detected', problemId, score, sourceCode ? '(code captured)' : '(no code)')
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

// pbinfo's source editors / submission form. Used to recognize "this form is a
// solution submission" so we only arm verdict capture on real submissions.
const SOURCE_EDITOR_SEL =
  'textarea[name="sursa"], textarea#sursa, .CodeMirror, .cm-editor, .ace_editor'
const SUBMISSION_FORM_SEL = '#form-incarcare-solutie'
const SUBMISSION_BUTTON_SEL = '#btn-submit'

function looksLikeSubmission(scope: ParentNode | null): boolean {
  if (!scope) return false
  try {
    return !!(scope as Element).querySelector?.(SOURCE_EDITOR_SEL)
  } catch {
    return false
  }
}

function watchSubmissions(): void {
  // Native form submit (capture phase, so we snapshot before navigation).
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target as HTMLElement | null
      if (
        form?.matches(SUBMISSION_FORM_SEL) ||
        looksLikeSubmission(form) ||
        looksLikeSubmission(document)
      ) {
        rememberSubmission()
      }
    },
    true
  )
  // Some submit controls fire via JS without a native submit event.
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest(
        'button, input[type="submit"], a'
      ) as HTMLElement | null
      if (!el) return
      const label = (el.textContent || (el as HTMLInputElement).value || '').toLowerCase()
      if (
        el.matches(SUBMISSION_BUTTON_SEL) ||
        (/trimite|trimitere|submit|evalueaz|adaug.*solu/.test(label) &&
          looksLikeSubmission(document))
      ) {
        rememberSubmission()
      }
    },
    true
  )
}

function init(): void {
  announcePage()
  watchSubmissions()
  scan()

  // Watch for verdicts / late-rendered statements appearing in the DOM.
  // Constrained to subtree text changes; debounced.
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      // Scan on problem pages and on any page where we have a problem context
      // (e.g. an evaluation/solution page), so verdicts are caught either way.
      if (isProblemPage(location.href) || lastProblemId != null) scan()
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
