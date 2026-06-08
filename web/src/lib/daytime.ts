import type { Daytime } from '../api/types'

export const DAYTIME_LABELS: Record<Daytime, string> = {
  breakfast: 'Frühstück', lunch: 'Mittag', dinner: 'Abend', snack: 'Snack',
}

export function defaultDaytime(now: Date = new Date()): Daytime {
  const h = now.getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 15 && h < 21) return 'dinner'
  return 'snack'
}
