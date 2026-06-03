import type { Problem, AppSettings, UserStatus } from '../../../shared/types'

export type Band = 'none' | 'partial' | 'complete'

/** Score band drives token coloring (see design section of the spec). */
export function scoreBand(score: number | null, s: AppSettings): Band {
  if (score === null || score <= 0) return 'none'
  if (score >= s.bandCompleted) return 'complete'
  if (score >= s.bandPartialMin) return 'partial'
  return 'none'
}

/**
 * Displayed status = user_status if the user has ever manually placed it,
 * otherwise derived from detected_score. Manual placement always wins.
 */
export function displayStatus(p: Problem, s: AppSettings): UserStatus {
  if (p.user_status) return p.user_status
  if ((p.detected_score ?? 0) >= s.bandCompleted) return 'completed'
  return 'in_progress'
}

export const bandRing: Record<Band, string> = {
  none: 'ring-slate-300',
  partial: 'ring-amber-400',
  complete: 'ring-brand-600'
}

export const bandText: Record<Band, string> = {
  none: 'text-slate-400',
  partial: 'text-amber-500',
  complete: 'text-brand-600'
}

export const bandTag: Record<Band, string> = {
  none: 'bg-slate-100 text-slate-500',
  partial: 'bg-amber-100 text-amber-700',
  complete: 'bg-brand-600 text-white'
}
