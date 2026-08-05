/**
 * cppFormat.ts — a small, dependency-free C++ beautifier.
 *
 * There is no clang-format in the bundled toolchain (w64devkit ships GCC only),
 * so "Format document" (Alt+Shift+F) is done here: re-indent every line from
 * brace/paren structure and normalise a few safe spacing habits. Strings, char
 * literals and comments are masked out first, so nothing inside them is ever
 * touched.
 */

const CONTROL = /\b(if|for|while|switch|catch)\s*\(/g
const CONTROL_HEADER = /^(if|else\s+if|for|while|switch|catch)\s*\(.*\)\s*$/
const CASE_LABEL = /^(case\b|default\s*:)/
const ACCESS_LABEL = /^(public|private|protected)\s*:/

interface Segment {
  text: string
  code: boolean
}

interface ScanResult {
  segments: Segment[]
  /** Same length as the line, with string/comment content blanked out. */
  masked: string
  inBlockComment: boolean
}

/** Split a line into code / non-code (string, char, comment) segments. */
function scanLine(line: string, startsInBlockComment: boolean): ScanResult {
  const segments: Segment[] = []
  let masked = ''
  let buf = ''
  let bufCode = !startsInBlockComment
  let inBlock = startsInBlockComment

  const flush = (): void => {
    if (buf) segments.push({ text: buf, code: bufCode })
    buf = ''
  }
  const push = (ch: string, code: boolean): void => {
    if (code !== bufCode) {
      flush()
      bufCode = code
    }
    buf += ch
    masked += code ? ch : ' '
  }

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    const next = line[i + 1]

    if (inBlock) {
      if (c === '*' && next === '/') {
        push('*', false)
        push('/', false)
        i++
        inBlock = false
      } else {
        push(c, false)
      }
      continue
    }

    if (c === '/' && next === '/') {
      for (; i < line.length; i++) push(line[i], false)
      break
    }
    if (c === '/' && next === '*') {
      push('/', false)
      push('*', false)
      i++
      inBlock = true
      continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      push(c, false)
      i++
      for (; i < line.length; i++) {
        push(line[i], false)
        if (line[i] === '\\') {
          if (i + 1 < line.length) push(line[++i], false)
          continue
        }
        if (line[i] === quote) break
      }
      continue
    }
    push(c, true)
  }

  flush()
  return { segments, masked, inBlockComment: inBlock }
}

// Operators normalised to exactly one space on each side. `*`, `&`, `.`, `->`,
// `::`, `++`, `--` and unary signs are deliberately left as the author typed
// them: telling `int *p` from `a * b` needs real parsing.
const SPACED_OPS = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=',
  '==', '!=', '<=', '>=', '<=>', '&&', '||', '<<', '>>', '<', '>', '/', '%', '|', '^', '+', '-'
])

const OPERATORS = [
  '<<=', '>>=', '->*', '<=>', '::', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=',
  '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '=', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', ',', ';',
  '(', ')', '[', ']', '{', '}', '.'
]

// Identifiers whose `<` opens a template argument list, not a comparison.
const TEMPLATES = new Set([
  'vector', 'map', 'set', 'pair', 'queue', 'stack', 'priority_queue', 'deque', 'list', 'tuple',
  'array', 'unordered_map', 'unordered_set', 'multiset', 'multimap', 'bitset', 'greater', 'less',
  'function', 'shared_ptr', 'unique_ptr', 'basic_string', 'complex', 'numeric_limits',
  'initializer_list', 'valarray', 'optional', 'variant', 'span', 'tree'
])

interface Token {
  text: string
  kind: 'word' | 'op' | 'space'
  /** `<`/`>` that delimit a template argument list — left untouched. */
  template?: boolean
  /** Decided per line: ternary `? :`, and `*` used as multiplication. */
  spaced?: boolean
}

function tokenizeCode(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === ' ' || c === '\t') {
      let j = i
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++
      tokens.push({ text: ' ', kind: 'space' })
      i = j
      continue
    }
    if (/[A-Za-z0-9_$#."']/.test(c) && !/[.]/.test(c)) {
      let j = i
      while (j < text.length && /[A-Za-z0-9_$#]/.test(text[j])) j++
      if (j > i) {
        tokens.push({ text: text.slice(i, j), kind: 'word' })
        i = j
        continue
      }
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i))
    if (op) {
      tokens.push({ text: op, kind: 'op' })
      i += op.length
      continue
    }
    tokens.push({ text: c, kind: 'word' })
    i++
  }
  return tokens
}

/** Mark angle brackets that belong to template argument lists. */
function markTemplates(tokens: Token[]): void {
  const code = tokens.filter((t) => t.kind !== 'space')
  const isTemplateLine = code[0]?.text === 'template'
  for (let i = 0; i < code.length; i++) {
    const tok = code[i]
    if (tok.text !== '<') continue
    const prev = code[i - 1]
    const opensTemplate =
      (isTemplateLine && i === 1) || (prev?.kind === 'word' && TEMPLATES.has(prev.text))
    if (!opensTemplate) continue

    const angles: Token[] = [tok]
    let depth = 1
    for (let j = i + 1; j < code.length && depth > 0; j++) {
      const t2 = code[j]
      if (t2.text === '<') {
        depth++
        angles.push(t2)
      } else if (t2.text === '>') {
        depth--
        angles.push(t2)
      } else if (t2.text === '>>') {
        depth -= 2
        angles.push(t2)
      } else if (t2.text === ';' || t2.text === '{') break
    }
    if (depth <= 0) for (const a of angles) a.template = true
  }
}

/**
 * Operators whose role depends on the line: the `?`/`:` pair of a ternary, and
 * `*` when it multiplies rather than declares a pointer (`a*b` vs `int *p`).
 */
function markContextualOps(tokens: Token[]): void {
  const code = tokens.filter((t) => t.kind !== 'space')

  let depth = 0
  for (let i = 0; i < code.length; i++) {
    const tok = code[i]
    if ('([{'.includes(tok.text)) depth++
    else if (')]}'.includes(tok.text)) depth--
    else if (tok.text === '?') {
      tok.spaced = true
      let d = depth
      for (let j = i + 1; j < code.length; j++) {
        const t2 = code[j]
        if ('([{'.includes(t2.text)) d++
        else if (')]}'.includes(t2.text)) d--
        else if (t2.text === ':' && d === depth) {
          t2.spaced = true
          break
        }
      }
    }
  }

  const opensWith = code[0]?.text
  for (let i = 0; i < code.length; i++) {
    if (code[i].text !== '*') continue
    const before = code.slice(0, i)
    if (before.length === 0) continue
    // Only names (and template arguments) before it => a pointer declaration.
    const declaration =
      before.every((t) => t.kind === 'word' || t.template || t.text === '::' || t.text === '*') &&
      !['return', 'case', 'delete'].includes(opensWith ?? '')
    if (!declaration) code[i].spaced = true
  }
}

/** True when `+`/`-` is a sign rather than an addition. */
function isUnarySign(prev: Token | undefined): boolean {
  if (!prev) return true
  if (prev.kind === 'word') return ['return', 'case', 'and', 'or', 'not'].includes(prev.text)
  return !([')', ']'].includes(prev.text) || prev.template)
}

/**
 * Safe spacing fixes applied to code (never to strings or comments).
 *
 * `atLineStart` / `atLineEnd` say whether this segment touches the edges of the
 * line: a segment that merely neighbours a string or comment keeps the space
 * that belongs between them (`cout << "x"; // note`).
 */
function tidyCode(
  text: string,
  isPreproc: boolean,
  atLineStart: boolean,
  atLineEnd: boolean
): string {
  if (isPreproc) return text.replace(/[ \t]+/g, ' ')

  const hadLeadingSpace = /^[ \t]/.test(text)
  const hadTrailingSpace = /[ \t]$/.test(text)
  const tokens = tokenizeCode(text)
  markTemplates(tokens)
  markContextualOps(tokens)

  const isSpaced = (tok: Token | undefined, before: Token | undefined): boolean =>
    tok !== undefined &&
    tok.kind === 'op' &&
    !tok.template &&
    (tok.spaced === true || SPACED_OPS.has(tok.text)) &&
    !(['+', '-'].includes(tok.text) && isUnarySign(before))

  let out = ''
  const meaningful: Token[] = []
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.kind === 'space') continue

    const prev = meaningful[meaningful.length - 1]
    const hadSpaceBefore = tokens[i - 1]?.kind === 'space'

    let sep = hadSpaceBefore ? ' ' : ''
    if (isSpaced(tok, prev) || isSpaced(prev, meaningful[meaningful.length - 2])) sep = ' '
    if (tok.text === ',' || tok.text === ';') sep = ''
    if (prev?.text === ',' || prev?.text === ';') sep = ' '
    // `{ ... }` kept on one line reads better with breathing room.
    if (prev?.text === '{' && tok.text !== '}') sep = ' '
    if (tok.text === '}' && prev !== undefined && prev.text !== '{') sep = ' '
    if (!prev) sep = ''

    out += sep + tok.text
    meaningful.push(tok)
  }

  const first = meaningful[0]
  const last = meaningful[meaningful.length - 1]
  const padLeft =
    !atLineStart &&
    first?.text !== ',' &&
    first?.text !== ';' &&
    (hadLeadingSpace || isSpaced(first, undefined))
  const padRight =
    !atLineEnd &&
    (hadTrailingSpace ||
      last?.text === ',' ||
      last?.text === ';' ||
      isSpaced(last, meaningful[meaningful.length - 2]))

  const body = out
    .replace(CONTROL, (m) => m.replace(/\s*\($/, ' ('))
    .replace(/([)\w\]])\s*\{/g, '$1 {')
    .replace(/\}\s*(else|catch)\b/g, '} $1')
  return (padLeft ? ' ' : '') + body + (padRight ? ' ' : '')
}

/**
 * Apply `transform` to the code of every line, leaving strings, char literals
 * and comments untouched. Used by the file-I/O conversion, which must not
 * rewrite a `cout` that appears inside a message or a comment.
 */
export function mapCode(source: string, transform: (code: string) => string): string {
  let inBlockComment = false
  return source
    .split('\n')
    .map((line) => {
      const scan = scanLine(line, inBlockComment)
      inBlockComment = scan.inBlockComment
      return scan.segments.map((s) => (s.code ? transform(s.text) : s.text)).join('')
    })
    .join('\n')
}

export interface CppFormatOptions {
  /** One indentation level. Defaults to four spaces. */
  indent?: string
}

export function formatCpp(source: string, options: CppFormatOptions = {}): string {
  const unit = options.indent ?? '    '
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []

  let depth = 0
  let hanging = 0 // pending indents from brace-less `if (...)` / `else` bodies
  let continuation = false // previous line left an expression unfinished
  let openParens = 0
  let inBlockComment = false
  const blockIsSwitch: boolean[] = []
  const sawCase: boolean[] = []
  let blankRun = 0

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (!trimmed) {
      blankRun++
      if (blankRun === 1) out.push('') // collapse runs of blank lines
      continue
    }
    blankRun = 0

    const wasInBlockComment = inBlockComment
    const scan = scanLine(trimmed, inBlockComment)
    inBlockComment = scan.inBlockComment
    const code = scan.masked.trim()

    // ---- indentation for this line ----
    let level: number
    if (wasInBlockComment) {
      level = depth + hanging
    } else if (trimmed.startsWith('#')) {
      level = 0
    } else if (openParens > 0) {
      level = depth + hanging + 1
    } else {
      level = depth + hanging + (continuation ? 1 : 0)
      const closesFirst = /^[})\]]/.test(code)
      if (closesFirst) level = Math.max(0, depth - 1)
      else if (ACCESS_LABEL.test(code)) level = Math.max(0, depth - 1)
      else if (blockIsSwitch[depth - 1]) {
        if (CASE_LABEL.test(code)) {
          level = depth
          sawCase[depth - 1] = true
        } else if (sawCase[depth - 1]) {
          level = depth + 1 + hanging
        }
      }
    }

    const body = wasInBlockComment
      ? trimmed.startsWith('*')
        ? ' ' + trimmed
        : trimmed
      : scan.segments
          .map((s, i) =>
            s.code
              ? tidyCode(
                  s.text,
                  trimmed.startsWith('#'),
                  i === 0,
                  i === scan.segments.length - 1
                )
              : s.text
          )
          .join('')
    out.push((unit.repeat(Math.max(0, level)) + body).trimEnd())

    if (wasInBlockComment) continue

    // ---- carry state to the next line ----
    const isSwitchLine = /\bswitch\s*\(/.test(code)
    for (const ch of scan.masked) {
      if (ch === '{') {
        blockIsSwitch[depth] = isSwitchLine
        sawCase[depth] = false
        depth++
        hanging = 0
      } else if (ch === '}') {
        depth = Math.max(0, depth - 1)
        blockIsSwitch[depth] = false
        sawCase[depth] = false
        hanging = 0
      } else if (ch === '(' || ch === '[') openParens++
      else if (ch === ')' || ch === ']') openParens = Math.max(0, openParens - 1)
    }

    if (trimmed.startsWith('#') || !code) {
      continuation = false
    } else if (CONTROL_HEADER.test(code) || /^(else|do)$/.test(code)) {
      hanging++
      continuation = false
    } else if (/[;{}:]$/.test(code)) {
      hanging = 0
      continuation = false
    } else {
      continuation = openParens === 0
    }
  }

  // Exactly one trailing newline.
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n') + '\n'
}
