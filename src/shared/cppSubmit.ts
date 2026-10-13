/**
 * cppSubmit.ts — starter + submission handling for function-only problems.
 *
 * The student keeps a local `main` to test, but pbinfo must receive ONLY the
 * required subprogram. We keep a single file split by a TEST marker: everything
 * below the marker is for local runs and is stripped on submit. As a safety
 * net, any remaining `main` is also removed (tokenizer-aware), so a stray main
 * can't break the submission.
 */
export const TEST_MARKER = '// ===== TEST LOCAL (nu se trimite la pbinfo) ====='

/** Starter for a subprogram problem: a stub to fill + a test harness below. */
export function subprogramStarter(name: string | null): string {
  const fn = name || 'rezolva'
  return `// Scrie aici DOAR definiția subprogramului cerut. Doar partea de deasupra
// separatorului se trimite la pbinfo.
// TODO: completează semnătura și corpul subprogramului.
void ${fn}() {

}

${TEST_MARKER}
#include <iostream>
using namespace std;

int main() {
    // Testează ${fn}() aici. Nimic din această zonă nu se trimite.

    return 0;
}
`
}

/** Starter for a class/OOP problem: a class stub + a test harness below. */
export function classStarter(name: string | null): string {
  const cls = name || 'Rezolvare'
  return `// Scrie aici DOAR definiția clasei cerute (copiază structura din enunț).
// Doar partea de deasupra separatorului se trimite la pbinfo.
class ${cls} {
public:

};

${TEST_MARKER}
#include <iostream>
using namespace std;

int main() {
    // Testează clasa ${cls} aici. Nimic din această zonă nu se trimite.

    return 0;
}
`
}

/**
 * Build the exact text sent to pbinfo. For function-only / class problems
 * (`stripMain`), drop the local-test region and any stray main; otherwise send
 * the source unchanged.
 */
export function prepareSubmission(source: string, stripMain: boolean): string {
  if (!stripMain) return source
  const idx = source.indexOf(TEST_MARKER)
  const head = idx >= 0 ? source.slice(0, idx) : source
  return stripMainFunction(head).trimEnd() + '\n'
}

/**
 * Remove every top-level `main` function definition, ignoring matches inside
 * comments, strings or char literals. Brace-matched so the whole body goes.
 */
export function stripMainFunction(source: string): string {
  const mainRe = /\b(?:int|void)\s+main\s*\(/g
  let out = source
  // Loop in case of (unusual) multiple mains.
  for (;;) {
    const start = findMainStart(out, mainRe)
    if (start < 0) break
    const bodyOpen = out.indexOf('{', start)
    if (bodyOpen < 0) break
    const end = matchBrace(out, bodyOpen)
    if (end < 0) break
    out = out.slice(0, start) + out.slice(end + 1)
    mainRe.lastIndex = 0
  }
  return out.replace(/\n{3,}/g, '\n\n')
}

/** Index of a `main(` declaration that is real code (not in a comment/string). */
function findMainStart(src: string, re: RegExp): number {
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (!isMasked(src, m.index)) return m.index
  }
  return -1
}

/** True if position `i` lies inside a comment, string or char literal. */
function isMasked(src: string, i: number): boolean {
  let inLine = false
  let inBlock = false
  let inStr = false
  let inChr = false
  for (let k = 0; k < i; k++) {
    const c = src[k]
    const n = src[k + 1]
    if (inLine) {
      if (c === '\n') inLine = false
    } else if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false
        k++
      }
    } else if (inStr) {
      if (c === '\\') k++
      else if (c === '"') inStr = false
    } else if (inChr) {
      if (c === '\\') k++
      else if (c === "'") inChr = false
    } else if (c === '/' && n === '/') {
      inLine = true
      k++
    } else if (c === '/' && n === '*') {
      inBlock = true
      k++
    } else if (c === '"') inStr = true
    else if (c === "'") inChr = true
  }
  return inLine || inBlock || inStr || inChr
}

/** Given the index of an opening `{`, return the index of its matching `}`. */
function matchBrace(src: string, open: number): number {
  let depth = 0
  let inLine = false
  let inBlock = false
  let inStr = false
  let inChr = false
  for (let k = open; k < src.length; k++) {
    const c = src[k]
    const n = src[k + 1]
    if (inLine) {
      if (c === '\n') inLine = false
    } else if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false
        k++
      }
    } else if (inStr) {
      if (c === '\\') k++
      else if (c === '"') inStr = false
    } else if (inChr) {
      if (c === '\\') k++
      else if (c === "'") inChr = false
    } else if (c === '/' && n === '/') {
      inLine = true
      k++
    } else if (c === '/' && n === '*') {
      inBlock = true
      k++
    } else if (c === '"') inStr = true
    else if (c === "'") inChr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return k
    }
  }
  return -1
}
