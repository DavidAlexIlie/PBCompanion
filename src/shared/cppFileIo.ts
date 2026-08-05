/**
 * cppFileIo.ts — turn a stdin/stdout solution into a file-I/O one.
 *
 * pbinfo problems that read and write named files need <fstream> plus the two
 * streams. "Convert" rewrites whatever is already in the editor: `cin`/`cout`
 * become `fin`/`fout`, the includes and stream declarations are added if
 * missing, and existing declarations are re-pointed at the detected file
 * names. Strings and comments are never touched, and running it twice changes
 * nothing the second time.
 */
import { mapCode } from './cppFormat'
import type { ProblemIoFiles } from './types'

const DECLARES_FIN = /\bifstream\s+fin\s*\(/
const DECLARES_FOUT = /\bofstream\s+fout\s*\(/

export function convertToFileIo(source: string, io: ProblemIoFiles): string {
  const { inputFile, outputFile } = io
  if (!inputFile && !outputFile) return source

  let out = source

  // std::cin / cin -> fin (same for cout), whole words only, code only.
  out = mapCode(out, (code) => {
    let text = code
    if (inputFile) text = text.replace(/\b(?:std\s*::\s*)?cin\b/g, 'fin')
    if (outputFile) text = text.replace(/\b(?:std\s*::\s*)?cout\b/g, 'fout')
    return text
  })

  // Re-point existing declarations at the detected names.
  out = mapCode(out, (code) => {
    let text = code
    if (inputFile) {
      text = text.replace(/(\bifstream\s+fin\s*\(\s*")[^"]*(")/g, `$1${inputFile}$2`)
    }
    if (outputFile) {
      text = text.replace(/(\bofstream\s+fout\s*\(\s*")[^"]*(")/g, `$1${outputFile}$2`)
    }
    return text
  })

  const codeOnly = mapCode(out, (code) => code).replace(/"[^"]*"/g, '""')
  const declarations = [
    inputFile && !DECLARES_FIN.test(codeOnly) ? `ifstream fin("${inputFile}");` : null,
    outputFile && !DECLARES_FOUT.test(codeOnly) ? `ofstream fout("${outputFile}");` : null
  ].filter((line): line is string => line !== null)

  if (declarations.length > 0) out = insertDeclarations(out, declarations)
  if (!/^\s*#include\s*<fstream>/m.test(out)) out = insertFstreamInclude(out)

  return out
}

/** Put the streams after `using namespace std;`, else after the includes. */
function insertDeclarations(source: string, declarations: string[]): string {
  const lines = source.split('\n')
  let at = lines.findIndex((l) => /^\s*using\s+namespace\s+std\s*;/.test(l))
  if (at === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*#\s*include\b/.test(lines[i])) at = i
    }
  }
  if (at === -1) {
    return [...declarations, '', ...lines].join('\n')
  }
  const trailer = lines[at + 1]?.trim() === '' ? [] : ['']
  lines.splice(at + 1, 0, '', ...declarations, ...trailer)
  return lines.join('\n')
}

function insertFstreamInclude(source: string): string {
  const lines = source.split('\n')
  const firstInclude = lines.findIndex((l) => /^\s*#\s*include\b/.test(l))
  lines.splice(Math.max(0, firstInclude), 0, '#include <fstream>')
  return lines.join('\n')
}
