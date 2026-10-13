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
  extractDetailedEvaluationScore,
  extractDetailedEvaluationFingerprint,
  extractDetailedEvaluationStats
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
const VERDICT_POLL_MS = 400
let verdictPollTimer: ReturnType<typeof setInterval> | null = null

interface PendingSubmit {
  problemId: number
  code: string | null
  t: number
  previousSubmissionId: string | null
  previousEvaluationFingerprint: string | null
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
          : extractLatestSubmissionId(document),
      previousEvaluationFingerprint:
        existing && Date.now() - existing.t < 2000
          ? existing.previousEvaluationFingerprint
          : extractDetailedEvaluationFingerprint(document)
    }
    writePending(pending)
    ensureVerdictPolling()
    log('submission observed', problemId, code ? '(code snapshot)' : '(no code)')
  } catch (err) {
    log('rememberSubmission failed (non-fatal)', err)
  }
}

function pendingForCurrentProblem(): PendingSubmit | null {
  const problemId = parseProblemUrl(location.href)?.id ?? lastProblemId
  const pending = readStoredPending()
  if (!pending) return null
  return problemId == null || pending.problemId === problemId ? pending : null
}

/** pbinfo sometimes updates existing text nodes without adding/removing DOM
 * nodes. Poll only while a submission is pending so those updates cannot be
 * missed, even when MutationObserver receives no useful event. */
function ensureVerdictPolling(): void {
  if (verdictPollTimer) return
  verdictPollTimer = setInterval(() => {
    if (!pendingForCurrentProblem()) {
      clearInterval(verdictPollTimer!)
      verdictPollTimer = null
      return
    }
    reportVerdict()
  }, VERDICT_POLL_MS)
}

function writePending(pending: PendingSubmit): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    ipcRenderer.send('pbinfo:pending-submit', pending)
  } catch {
    /* ignore */
  }
}

async function restorePendingFromMain(): Promise<void> {
  try {
    if (readStoredPending()) return
    const pending = (await ipcRenderer.invoke('pbinfo:get-pending-submit')) as PendingSubmit | null
    if (!pending || Date.now() - pending.t > PENDING_TTL_MS) {
      ipcRenderer.send('pbinfo:pending-submit', null)
      return
    }
    writePending(pending)
    ensureVerdictPolling()
    reportVerdict()
    log('pending submission restored', pending.problemId)
  } catch (err) {
    log('restorePendingFromMain failed (non-fatal)', err)
  }
}

function readPending(problemId: number): PendingSubmit | null {
  const pending = readStoredPending()
  return pending?.problemId === problemId ? pending : null
}

function readStoredPending(): PendingSubmit | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PendingSubmit
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
    const problemId = fromUrl ?? lastProblemId ?? readStoredPending()?.problemId ?? null
    if (problemId == null) return
    // No submission we saw → this is a historic score being displayed; ignore.
    const pending = readPending(problemId)
    if (!pending) return
    const currentSubmissionId = extractLatestSubmissionId(document)
    const currentEvaluationFingerprint = extractDetailedEvaluationFingerprint(document)
    const hasNewSubmissionRow =
      currentSubmissionId !== null &&
      (!pending.previousSubmissionId || currentSubmissionId !== pending.previousSubmissionId)
    const hasNewEvaluation =
      currentEvaluationFingerprint !== null &&
      currentEvaluationFingerprint !== pending.previousEvaluationFingerprint

    // pbinfo sometimes renders the fresh evaluation table before updating the
    // solutions-list row. Either signal proves this is the submission we saw.
    // Until one changes, never reuse an older row/table as the new verdict.
    if (!hasNewSubmissionRow && !hasNewEvaluation) return

    // pbinfo leaves old completed attempts visible while the newest one is
    // pending. Prefer only the newest row and never reuse an older row's score.
    const latest = extractLatestSubmissionVerdict(document)
    if (latest?.pending) {
      if (currentSubmissionId && pending.activeSubmissionId !== currentSubmissionId) {
        pending.activeSubmissionId = currentSubmissionId
        writePending(pending)
      }
      const detailed =
        (hasNewEvaluation || hasNewSubmissionRow) &&
        (!hasNewSubmissionRow || pending.activeSubmissionId === currentSubmissionId)
          ? extractDetailedEvaluationScore(document)
          : null
      if (detailed === null) return
      finishVerdict(problemId, detailed, pending)
      return
    }
    if (hasNewEvaluation) {
      const detailed = extractDetailedEvaluationScore(document)
      if (detailed !== null) {
        finishVerdict(problemId, detailed, pending)
        return
      }
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
  const stats =
    extractDetailedEvaluationFingerprint(document) !== pending.previousEvaluationFingerprint
      ? extractDetailedEvaluationStats(document)
      : null
  sessionStorage.removeItem(PENDING_KEY) // consume once
  ipcRenderer.send('pbinfo:pending-submit', null)
  if (verdictPollTimer) {
    clearInterval(verdictPollTimer)
    verdictPollTimer = null
  }
  ipcRenderer.send('pbinfo:verdict-detected', {
    problemId,
    score,
    sourceCode,
    timestamp: new Date().toISOString(),
    testsTotal: stats?.total,
    testsFailed: stats?.failed
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

// ----------------------------------------------------------------------------
// pbinfo login autofill (local-only). The user's saved login lives encrypted
// on this machine; here we only (a) fill the login fields so the user can click
// "Autentificare", and (b) report a login the user submits so main can offer to
// remember it. The plaintext is handled only in this webview (where the user
// types it anyway) and the main process — never in our React UI.
// ----------------------------------------------------------------------------
// pbinfo has TWO login spots: the "Autentificare" modal (#form-login-modal)
// and an inline form on the home page. Both are plain forms with a password
// field, so we work generically off any `input[type=password]` instead of
// hard-coded ids — that covers both, and survives markup tweaks.
const SECRET_SEL = 'input[type="password"]'
const USER_SEL =
  '#user_login, input[name="user"], input[name="username"], input[name="email"], input[type="email"]'

function onPbinfo(): boolean {
  try {
    return location.hostname.endsWith('pbinfo.ro')
  } catch {
    return false
  }
}

interface LoginPair {
  scope: ParentNode
  user: HTMLInputElement
  secret: HTMLInputElement
}

/** The username field paired with a given password field, within its form. */
function userFieldFor(scope: ParentNode, secret: HTMLInputElement): HTMLInputElement | null {
  const explicit = scope.querySelector<HTMLInputElement>(USER_SEL)
  if (explicit) return explicit
  // Fall back to the text input that sits just before the password field.
  const texts = [
    ...scope.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')
  ]
  const before = texts.filter(
    (t) => t.compareDocumentPosition(secret) & Node.DOCUMENT_POSITION_FOLLOWING
  )
  return before[before.length - 1] ?? texts[0] ?? null
}

/** Every login form on the page: one per password field, deduped by scope. */
function loginPairs(): LoginPair[] {
  const pairs: LoginPair[] = []
  const seen = new Set<ParentNode>()
  for (const secret of document.querySelectorAll<HTMLInputElement>(SECRET_SEL)) {
    const scope = (secret.closest('form') as ParentNode) ?? document
    if (seen.has(scope)) continue
    const user = userFieldFor(scope, secret)
    if (user) {
      seen.add(scope)
      pairs.push({ scope, user, secret })
    }
  }
  return pairs
}

let savedCreds: { user: string; secret: string } | null | undefined // undefined = not fetched
const filledForms = new WeakSet<ParentNode>()

async function autofillLogin(): Promise<void> {
  try {
    if (!onPbinfo()) return
    const pairs = loginPairs()
    if (pairs.length === 0) return
    if (savedCreds === undefined) {
      savedCreds = (await ipcRenderer.invoke('creds:get')) as typeof savedCreds
    }
    if (!savedCreds) return
    for (const { scope, user, secret } of pairs) {
      if (filledForms.has(scope)) continue
      if (user.value || secret.value) continue // don't clobber typed input
      filledForms.add(scope)
      setFieldValue(user, savedCreds.user)
      setFieldValue(secret, savedCreds.secret)
      log('login autofilled from local store')
    }
  } catch (err) {
    log('autofillLogin failed (non-fatal)', err)
  }
}

function setFieldValue(el: HTMLInputElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function captureFrom(scope: ParentNode): void {
  try {
    if (!onPbinfo()) return
    const secret = scope.querySelector<HTMLInputElement>(SECRET_SEL)
    if (!secret) return
    const userField = userFieldFor(scope, secret)
    const user = userField?.value.trim() ?? ''
    const pw = secret.value
    if (!user || !pw) return
    ipcRenderer.send('pbinfo:login-attempt', { user, secret: pw })
    log('login submission observed (pending pbinfo confirmation)')
  } catch (err) {
    log('captureFrom failed (non-fatal)', err)
  }
}

const LOGIN_LABEL_RE = /autentificare|conectare|logare|log\s*in|login|intra in cont/i

function watchLogin(): void {
  // Native submit (Enter or a type=submit button) on any form with a password.
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target as HTMLElement | null
      if (form?.querySelector?.(SECRET_SEL)) captureFrom(form)
    },
    true
  )
  // JS-driven submits (a button/link that posts without a native submit event).
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest(
        'button, input[type="submit"], a'
      ) as HTMLElement | null
      if (!el) return
      const label = (el.textContent || (el as HTMLInputElement).value || '').trim()
      const isSubmit = el.getAttribute('type') === 'submit'
      if (!isSubmit && !LOGIN_LABEL_RE.test(label)) return
      // Prefer the enclosing form; fall back to the whole document so the
      // home-page spot works even if its markup differs from the modal.
      const scope = (el.closest('form') as ParentNode) ?? document
      if (scope.querySelector?.(SECRET_SEL)) captureFrom(scope)
    },
    true
  )
}

function init(): void {
  announcePage()
  watchSubmissions()
  watchLogin()
  void autofillLogin()
  scan()
  if (pendingForCurrentProblem()) ensureVerdictPolling()
  void restorePendingFromMain()

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
      void autofillLogin() // the login modal may be injected after load
    }, 600)
  }
  try {
    const obs = new MutationObserver(schedule)
    obs.observe(document.documentElement, {
      childList: true,
      characterData: true,
      attributes: true,
      subtree: true
    })
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
