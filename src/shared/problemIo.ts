import type { ProblemIoFiles } from './types'

const FILE = '([A-Za-z0-9_-]+\\.(?:in|out|txt))'

export function detectProblemIoFiles(statementHtml: string | null): ProblemIoFiles {
  if (!statementHtml) return { inputFile: null, outputFile: null }
  const text = decodeHtml(statementHtml)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

  return {
    inputFile: findFile(text, [
      new RegExp(`fisierul\\s+de\\s+intrare\\s+${FILE}`, 'i'),
      new RegExp(`datele\\s+de\\s+intrare[^.]{0,100}?fisierul\\s+${FILE}`, 'i'),
      new RegExp(`intrare\\s*[:/]\\s*${FILE}`, 'i')
    ]),
    outputFile: findFile(text, [
      new RegExp(`fisierul\\s+de\\s+iesire\\s+${FILE}`, 'i'),
      new RegExp(`datele\\s+de\\s+iesire[^.]{0,100}?fisierul\\s+${FILE}`, 'i'),
      new RegExp(`iesire\\s*[:/]\\s*${FILE}`, 'i')
    ])
  }
}

function findFile(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

function decodeHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
}
