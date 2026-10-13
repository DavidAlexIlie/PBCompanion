/**
 * problemType.ts — classify a pbinfo problem by what the checker expects.
 *
 *   'console'    — full program, cin/cout
 *   'file'       — full program, ifstream/ofstream on named files
 *   'subprogram' — ONLY the required function/subprogram, no main (pbinfo
 *                  supplies its own main; sending a main breaks compilation)
 *
 * Detection runs on the statement text, diacritic-insensitive (pbinfo mixes
 * ş/ș and ţ/ț). See the catalog in the project notes.
 */
import type { ProblemIoFiles } from './types'

export type ProblemType = 'console' | 'file' | 'subprogram' | 'class'

function plain(statementHtml: string | null): string {
  if (!statementHtml) return ''
  return statementHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

const SUBPROGRAM_RE =
  /(defini[t]ia( completa)? a? ?subprogramului|numele subprogramului cerut|parametrii sunt,? in aceasta ordine|va contine doar defini[t]ia|scrieti (definitia|subprogramul))/i

// Tight on purpose: in Romanian "metoda"/"constructor" appear in many non-OOP
// statements, so we require the explicit "definiti … clasa X" phrasing. (A
// full pbinfo crawl showed only a handful of real OOP problems.)
const CLASS_RE =
  /(defini[t]i\b[^.]{0,30}\bclasa\s+[a-z_]\w*|definitia clasei|declara[t]i\b[^.]{0,20}\bclasa|programare orientata pe obiecte)/i

export function detectProblemType(statementHtml: string | null, io: ProblemIoFiles): ProblemType {
  const text = plain(statementHtml)
  if (text && SUBPROGRAM_RE.test(text)) return 'subprogram'
  if (text && CLASS_RE.test(text)) return 'class'
  if (io.inputFile || io.outputFile) return 'file'
  return 'console'
}

/** The required class's name, if the statement spells it out. */
export function extractClassName(statementHtml: string | null): string | null {
  const text = plain(statementHtml)
  const m = text.match(/\bclasa\s+([A-Za-z_]\w*)/i)
  return m?.[1] ?? null
}

/** The required subprogram's name, if the statement spells it out. */
export function extractSubprogramName(statementHtml: string | null): string | null {
  const text = plain(statementHtml)
  const patterns = [
    /numele subprogramului cerut este\s+([A-Za-z_]\w*)/i,
    /subprogramului(?: C\+\+)?\s+([A-Za-z_]\w*)/i,
    /defini[t]ia(?: completa)? a?\s*subprogramului\s+([A-Za-z_]\w*)/i
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}
