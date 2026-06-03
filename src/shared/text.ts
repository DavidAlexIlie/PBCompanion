/**
 * Strip a leading problem-number from a title so we don't show it twice
 * (the UI already renders the id separately, e.g. a blue "#12").
 *
 * Only the problem's OWN id is removed — never an arbitrary leading number —
 * so a title like "2048" or "100 de uși" is left intact.
 */
export function cleanProblemName(
  raw: string | null | undefined,
  id?: number,
  slug?: string | null
): string {
  let t = (raw ?? '').trim()
  if (id != null) {
    // matches "#12", "12", "012", optionally followed by . : - – — ) ] and spaces
    const re = new RegExp(`^#?\\s*0*${id}\\b\\s*[-–—.:)\\]]*\\s*`)
    t = t.replace(re, '').trim()
  }
  if (!t) t = slug ?? (id != null ? `Problem ${id}` : 'Problem')
  return t
}
