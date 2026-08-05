/**
 * cppStarter.ts — the skeleton a new solution starts from.
 *
 * pbinfo problems either read stdin/stdout or a named file pair. The file
 * variant needs <fstream> plus the two streams, so the workspace offers the
 * right skeleton per problem — and Format upgrades an untouched skeleton once
 * the statement reveals the file names.
 */
import type { ProblemIoFiles } from './types'

const PLAIN = `#include <iostream>
using namespace std;

int main() {

    return 0;
}
`

export function starterFor(io: ProblemIoFiles): string {
  const { inputFile, outputFile } = io
  if (!inputFile && !outputFile) return PLAIN

  const streams = [
    inputFile ? `ifstream fin("${inputFile}");` : null,
    outputFile ? `ofstream fout("${outputFile}");` : null
  ].filter(Boolean)
  const closes = [
    inputFile ? '    fin.close();' : null,
    outputFile ? '    fout.close();' : null
  ].filter(Boolean)

  return `#include <fstream>
#include <iostream>
using namespace std;

${streams.join('\n')}

int main() {

${closes.join('\n')}
    return 0;
}
`
}

/** Whitespace- and filename-insensitive, so a reformatted skeleton still counts. */
function shape(source: string): string {
  return source.replace(/"[^"]*"/g, '""').replace(/\s+/g, '')
}

/**
 * True while the buffer still holds an untouched skeleton (any variant, any
 * file names) — the only case where replacing it loses nothing.
 */
export function isStarterTemplate(source: string): boolean {
  if (!source.trim()) return true
  const variants = [
    { inputFile: null, outputFile: null },
    { inputFile: 'a.in', outputFile: 'a.out' },
    { inputFile: 'a.in', outputFile: null },
    { inputFile: null, outputFile: 'a.out' }
  ]
  const s = shape(source)
  return variants.some((io) => shape(starterFor(io)) === s)
}
