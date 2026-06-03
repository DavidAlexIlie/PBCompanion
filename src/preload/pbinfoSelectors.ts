import { cleanSourceCode } from '../shared/sourceCode'

/**
 * pbinfoSelectors.ts — THE SINGLE SOURCE OF TRUTH FOR pbinfo's DOM.
 *
 * pbinfo's markup is treated as UNSTABLE. Every selector below has multiple
 * fallback candidates, and every extractor is wrapped so a null/throw never
 * crashes the app — it just yields a partial result. When pbinfo changes its
 * HTML, this is the ONLY file you should need to touch.
 *
 * This module is pure: every function takes a Document/Element and returns
 * plain data. No IPC, no side effects. That keeps it trivial to reason about
 * and to fix.
 */

export const PBINFO_ORIGIN = 'https://www.pbinfo.ro'

/** Matches a problem page URL: /probleme/<id>/<slug> (slug optional). */
const PROBLEM_URL_RE = /\/probleme\/(\d+)(?:\/([^/?#]+))?/i

export interface ParsedProblemUrl {
  id: number
  slug: string
}

/** Pull the problem id + slug straight from the URL — the most reliable signal. */
export function parseProblemUrl(href: string): ParsedProblemUrl | null {
  try {
    const m = href.match(PROBLEM_URL_RE)
    if (!m) return null
    const id = Number(m[1])
    if (!Number.isFinite(id) || id <= 0) return null
    return { id, slug: (m[2] || '').toLowerCase() }
  } catch {
    return null
  }
}

/** Try a list of CSS selectors, return the first matching element's trimmed text. */
function firstText(doc: ParentNode, selectors: string[]): string | null {
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel)
      const t = el?.textContent?.trim()
      if (t) return t
    } catch {
      /* bad selector — ignore and keep trying */
    }
  }
  return null
}

/** Try a list of CSS selectors, return the first matching element's innerHTML. */
function firstHtml(doc: ParentNode, selectors: string[]): string | null {
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel) as HTMLElement | null
      const html = el?.innerHTML?.trim()
      if (html) return html
    } catch {
      /* ignore */
    }
  }
  return null
}

// --- Problem title -------------------------------------------------------
const TITLE_SELECTORS = [
  'h1.text-primary',
  'main h1',
  'article h1',
  '.card-header h1',
  'h1'
]

export function extractTitle(doc: Document): string | null {
  let t = firstText(doc, TITLE_SELECTORS)
  // pbinfo titles often look like "1234 - InversMax". Strip a leading id.
  if (t) t = t.replace(/^\s*\d+\s*[-–—.:]\s*/, '').trim()
  // Last resort: document.title (e.g. "InversMax - #1234 | pbinfo").
  if (!t && doc.title) {
    t = doc.title.split(/[|\-–—]/)[0]?.trim() || null
  }
  return t || null
}

// --- Problem statement (enunț) ------------------------------------------
const STATEMENT_SELECTORS = [
  '#enunt',
  '.enunt',
  '#problema-enunt',
  '[data-enunt]',
  'article .text-justify',
  'main .card-body',
  'article'
]

export function extractStatementHtml(doc: Document): string | null {
  return firstHtml(doc, STATEMENT_SELECTORS)
}

// --- Submission verdict / score -----------------------------------------
/**
 * pbinfo shows scores like "100 de puncte", "100 puncte", or "Scor: 100".
 * We scan a constrained set of likely containers (and as a last resort the
 * whole body) for that pattern. Returns 0..100 or null.
 */
const VERDICT_CONTAINERS = [
  '.evaluare',
  '#evaluare',
  '.detalii-evaluare',
  '.rezultat',
  '.scor',
  '.punctaj',
  '.badge',
  '.label',
  '.alert',
  '.text-success',
  'td',
  'table.table',
  '.table-responsive'
]

// A score number may carry decimals on pbinfo (e.g. "100.00 puncte",
// "100,00 puncte"); we keep the integer part. Two shapes are recognized:
//   - a bare points value: "10 puncte", "100 de puncte"
//   - a LABELED total: "Punctaj: 100", "Scor final 100" (this is the number
//     pbinfo computed — the one we actually want when both are on the page).
const PUNCTE_RE_G = /(\d{1,3})(?:[.,]\d+)?\s*(?:de\s+)?puncte/gi
const LABEL_RE_G = /(?:punctaj|scor)(?:\s+(?:final|total|obtinut|obținut|maxim))?\s*[:=]?\s*(\d{1,3})(?:[.,]\d+)?/gi

function collectScores(text: string, re: RegExp): number[] {
  const out: number[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n >= 0 && n <= 100) out.push(n)
  }
  return out
}

/**
 * The page lists per-test points (e.g. "10 puncte" ten times) AND the total.
 * If pbinfo gives us a LABELED total ("Punctaj: 100") we trust that — otherwise
 * a per-test "10" can outrank nothing and win. Only when no label is present do
 * we fall back to the max bare "X puncte" value (the total is the largest).
 */
function scoreFromText(text: string): { labeled: number[]; bare: number[] } {
  if (!text) return { labeled: [], bare: [] }
  return { labeled: collectScores(text, LABEL_RE_G), bare: collectScores(text, PUNCTE_RE_G) }
}

export function extractScore(doc: Document): number | null {
  const labeled: number[] = []
  const bare: number[] = []
  for (const sel of VERDICT_CONTAINERS) {
    try {
      for (const node of Array.from(doc.querySelectorAll(sel))) {
        const r = scoreFromText(node.textContent || '')
        labeled.push(...r.labeled)
        bare.push(...r.bare)
      }
    } catch {
      /* ignore */
    }
  }
  if (labeled.length) return Math.max(...labeled)
  if (bare.length) return Math.max(...bare)
  // Whole-body fallback, but only if the page even mentions evaluation.
  const body = doc.body?.textContent || ''
  if (/evaluare|verdict|puncte|scor/i.test(body)) {
    const r = scoreFromText(body)
    if (r.labeled.length) return Math.max(...r.labeled)
    if (r.bare.length) return Math.max(...r.bare)
  }
  return null
}

export interface LatestSubmissionVerdict {
  pending: boolean
  score: number | null
}

export function extractLatestSubmissionId(doc: Document): string | null {
  try {
    const text = doc.querySelector('#lista-solutii tbody tr td')?.textContent?.trim() || ''
    const match = text.match(/#?\d+/)
    return match?.[0]?.replace(/^#/, '') || null
  } catch {
    return null
  }
}

/**
 * pbinfo keeps older attempts visible in #lista-solutii while the newest one
 * is evaluated. Only the first row belongs to the submission we just observed;
 * taking a max from the whole page can incorrectly reuse an older 100.
 */
export function extractLatestSubmissionVerdict(doc: Document): LatestSubmissionVerdict | null {
  try {
    const row = doc.querySelector('#lista-solutii tbody tr')
    if (!row) return null
    const cells = Array.from(row.querySelectorAll(':scope > td'))
    if (cells.length < 2) return null
    const normalized = (row.textContent || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    if (/asteapta evaluarea|in curs|se evalueaz|pending|waiting/.test(normalized)) {
      return { pending: true, score: null }
    }
    if (!/evaluare finalizat/.test(normalized)) return null
    const scoreText = cells[cells.length - 1]?.textContent?.trim() || ''
    const match = scoreText.match(/^(100|[1-9]?\d)(?:[.,]\d+)?$/)
    return { pending: false, score: match ? Number(match[1]) : null }
  } catch {
    return null
  }
}

/**
 * When evaluation completes, pbinfo inserts #detalii-evaluare before its
 * newest solutions-list row changes from "waiting" to "finished". The total
 * is not printed explicitly: it is the sum of the "Scor obtinut" column.
 */
export function extractDetailedEvaluationScore(doc: Document): number | null {
  try {
    const table = doc.querySelector('#detalii-evaluare table')
    if (!table) return null
    const heading = (table.querySelector('thead')?.textContent || table.textContent || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    if (!/scor posibil/.test(heading) || !/scor obtinut/.test(heading)) return null
    const rows = Array.from(table.querySelectorAll('tbody tr'))
    if (!rows.length) return null
    const scores: number[] = []
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll(':scope > td'))
      const text = cells[cells.length - 1]?.textContent?.trim() || ''
      const match = text.match(/^(100|[1-9]?\d)(?:[.,](\d+))?$/)
      // A partially-filled evaluation table is still in progress.
      if (!match) return null
      scores.push(Number(text.replace(',', '.')))
    }
    if (!scores.length) return null
    const total = scores.reduce((sum, score) => sum + score, 0)
    return total >= 0 && total <= 100 ? Math.round(total) : null
  } catch {
    return null
  }
}

export function extractDetailedEvaluationStats(
  doc: Document
): { total: number; failed: number } | null {
  try {
    const rows = Array.from(doc.querySelectorAll('#detalii-evaluare table tbody tr'))
    if (!rows.length) return null
    let failed = 0
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll(':scope > td'))
      if (cells.length < 2) return null
      const possible = Number((cells[cells.length - 2]?.textContent ?? '').trim().replace(',', '.'))
      const obtained = Number((cells[cells.length - 1]?.textContent ?? '').trim().replace(',', '.'))
      if (!Number.isFinite(possible) || !Number.isFinite(obtained)) return null
      if (obtained < possible) failed++
    }
    return { total: rows.length, failed }
  } catch {
    return null
  }
}

/** Used to distinguish the previous evaluation table from the one generated
 * for the submission that was just sent. */
export function extractDetailedEvaluationFingerprint(doc: Document): string | null {
  const text = doc.querySelector('#detalii-evaluare table')?.textContent
  return text ? text.replace(/\s+/g, ' ').trim() : null
}

// --- Submitted source code (best-effort) --------------------------------
/**
 * Capturing the EXACT submitted source is unreliable on pbinfo. We try the
 * usual editors/containers; if we find nothing we return null and the app
 * honestly records the attempt as "code not captured" rather than faking it.
 */
const SOURCE_SELECTORS = [
  'textarea[name="sursa"]',
  'textarea#sursa',
  'pre.sursa',
  '.cod-sursa'
]

/**
 * Line-numbered code dumps (CodeMirror gutters, highlight.js line tables, etc.)
 * prefix every line with an incrementing integer. We only strip when those
 * numbers form a consecutive run (1,2,3,…) that dominates the text, so a real
 * line of code that happens to start with a number is never mangled.
 */
/** Join an editor's per-line elements with real newlines. CodeMirror/Ace put
 *  line numbers in a SEPARATE gutter, so the line nodes are clean source. */
function linesFrom(root: Element, lineSelector: string): string | null {
  const lines = Array.from(root.querySelectorAll(lineSelector))
  if (!lines.length) return null
  const text = lines.map((l) => (l as HTMLElement).textContent ?? '').join('\n')
  return text.trim() ? text : null
}

/** pbinfo's CodeMirror build renders one direct child per visible source line,
 *  without the usual .CodeMirror-line class. */
function directLinesFrom(root: Element): string | null {
  const lines = Array.from(root.children)
  if (lines.length < 2) return null
  const text = lines.map((line) => line.textContent ?? '').join('\n')
  return text.trim() ? text : null
}

export function extractSourceCode(doc: Document): string | null {
  const submissionForm = doc.querySelector('#form-incarcare-solutie')
  const editorScope: ParentNode = submissionForm ?? doc

  // Prefer CodeMirror's authoritative value over its rendered line/gutter DOM.
  const cmWrapper = editorScope.querySelector('.CodeMirror') as
    | (HTMLElement & { CodeMirror?: { getValue?: () => string } })
    | null
  const cmValue = cmWrapper?.CodeMirror?.getValue?.()
  if (cmValue?.trim()) return cleanSourceCode(cmValue)

  // pbinfo synchronizes CodeMirror into this hidden textarea during submit.
  const sourceTextarea = editorScope.querySelector(
    'textarea[name="sursa"]'
  ) as HTMLTextAreaElement | null
  if (sourceTextarea?.value.trim()) return cleanSourceCode(sourceTextarea.value)

  // CodeMirror 5 / 6: visual lines as .CodeMirror-line / .cm-line.
  const cm = editorScope.querySelector('.CodeMirror-code, .cm-content')
  if (cm) {
    const t = linesFrom(cm, '.CodeMirror-line, .cm-line') ?? directLinesFrom(cm)
    if (t) return cleanSourceCode(t)
  }
  // Ace editor: .ace_line inside the content layer (gutter is separate).
  const ace = editorScope.querySelector('.ace_content, .ace_editor')
  if (ace) {
    const t = linesFrom(ace, '.ace_line')
    if (t) return cleanSourceCode(t)
  }
  for (const sel of SOURCE_SELECTORS) {
    try {
      const el = editorScope.querySelector(sel)
      if (!el) continue
      if (el instanceof HTMLTextAreaElement && el.value.trim()) return cleanSourceCode(el.value)
      const t = el.textContent
      if (t && t.trim()) return cleanSourceCode(t)
    } catch {
      /* ignore */
    }
  }
  return null
}

/** True if the current document looks like an individual problem page. */
export function isProblemPage(href: string): boolean {
  return parseProblemUrl(href) !== null
}
