/**
 * Normalize captured source while preserving indentation and meaningful blank
 * lines. Some rendered code blocks mix their visual line-number gutter into
 * textContent; remove it only when it forms a clear consecutive sequence.
 */
export function cleanSourceCode(source: string): string {
  const normalized = source.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '')
  let lines = normalized.split('\n')

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
