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
  '.alert',
  'table.table',
  '.table-responsive'
]

const SCORE_RE = /(?:scor[^0-9]{0,10})?\b(100|[1-9]?\d)\b\s*(?:de\s+)?puncte/i
const SCORE_LABEL_RE = /scor[^0-9]{0,6}(100|[1-9]?\d)\b/i

function scoreFromText(text: string): number | null {
  if (!text) return null
  const m = text.match(SCORE_RE) || text.match(SCORE_LABEL_RE)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}

export function extractScore(doc: Document): number | null {
  for (const sel of VERDICT_CONTAINERS) {
    try {
      const nodes = doc.querySelectorAll(sel)
      for (const node of Array.from(nodes)) {
        const s = scoreFromText(node.textContent || '')
        if (s !== null) return s
      }
    } catch {
      /* ignore */
    }
  }
  // Whole-body fallback, but only if the page even mentions evaluation.
  const body = doc.body?.textContent || ''
  if (/evaluare|verdict|puncte|scor/i.test(body)) {
    return scoreFromText(body)
  }
  return null
}

// --- Submitted source code (best-effort) --------------------------------
/**
 * Capturing the EXACT submitted source is unreliable on pbinfo. We try the
 * usual editors/containers; if we find nothing we return null and the app
 * honestly records the attempt as "code not captured" rather than faking it.
 */
const SOURCE_SELECTORS = [
  '.CodeMirror-code',
  '.ace_content',
  'textarea[name="sursa"]',
  'textarea#sursa',
  'pre code',
  'pre.sursa',
  '.cod-sursa'
]

export function extractSourceCode(doc: Document): string | null {
  for (const sel of SOURCE_SELECTORS) {
    try {
      const el = doc.querySelector(sel)
      if (!el) continue
      if (el instanceof HTMLTextAreaElement && el.value.trim()) return el.value
      const t = el.textContent
      if (t && t.trim()) return t
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
