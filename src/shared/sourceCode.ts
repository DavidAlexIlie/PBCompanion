/**
 * Normalize captured source while preserving indentation and meaningful blank
 * lines. Some rendered code blocks mix their visual line-number gutter into
 * textContent; remove it only when it forms a clear consecutive sequence.
 */
export function cleanSourceCode(source: string): string {
  const normalized = source
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[ \t]+$/gm, '')
  let lines = normalized.split('\n')

  const numberedBlock = extractBestNumberedBlock(lines)
  if (numberedBlock) lines = numberedBlock

  // Shape produced by some line-number plugins:
  //   1
  //   #include <iostream>
  //   2
  //   using namespace std;
  const standaloneNumbers = lines.filter((line) => /^\s*\d{1,6}\s*$/.test(line))
  if (standaloneNumbers.length >= 3 && standaloneNumbers.length >= Math.floor(lines.length * 0.35)) {
    const numbers = standaloneNumbers.map((line) => Number(line.trim()))
    if (isConsecutive(numbers)) lines = lines.filter((line) => !/^\s*\d{1,6}\s*$/.test(line))
  }

  // Shape produced by copied table/gutter text:
  //   1  #include <iostream>
  //   2  using namespace std;
  const prefixed = lines
    .map((line, index) => {
      const match = line.match(/^\s*(\d{1,6})(?:[.)\]:]\s?|\t| )(.*)$/)
      return match ? { index, number: Number(match[1]), code: match[2] } : null
    })
    .filter((item): item is { index: number; number: number; code: string } => item !== null)
  const meaningfulCount = lines.filter((line) => line.trim()).length
  if (
    prefixed.length >= 3 &&
    prefixed.length >= Math.floor(meaningfulCount * 0.6) &&
    isConsecutive(prefixed.map((item) => item.number))
  ) {
    const replacements = new Map(prefixed.map((item) => [item.index, item.code]))
    lines = lines.map((line, index) => replacements.get(index) ?? line)
  }

  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n')
}

function isConsecutive(numbers: number[]): boolean {
  return numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1)
}

/**
 * pbinfo can expose rendered source as multiple concatenated blocks such as
 * "1", "2", "3#include...", ..., "45}", then reset to "1" for another block.
 * Split those runs at every reset and keep the longest coherent source block.
 */
function extractBestNumberedBlock(lines: string[]): string[] | null {
  const parsed = lines.map((line) => {
    const match = line.match(/^\s*(\d{1,6})(.*)$/)
    return match ? { number: Number(match[1]), code: match[2] } : null
  })
  const numberedCount = parsed.filter(Boolean).length
  if (numberedCount < 3 || numberedCount < Math.floor(lines.length * 0.75)) return null

  const runs: { number: number; code: string }[][] = []
  let current: { number: number; code: string }[] = []
  for (const item of parsed) {
    if (!item) continue
    const previous = current[current.length - 1]
    if (previous && item.number !== previous.number + 1) {
      if (current.length >= 3) runs.push(current)
      current = []
    }
    current.push(item)
  }
  if (current.length >= 3) runs.push(current)
  if (!runs.length) return null

  const best = runs.sort((a, b) => b.length - a.length)[0]
  return best.map((item) => item.code)
}
