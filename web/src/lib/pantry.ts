import { isDrink } from './nutrition'

// BLS-Hauptgruppen-Buchstabe → freundliche Kategorie (siehe Memory BLS-Einheiten).
export const BLS_GROUPS: Record<string, string> = {
  B: 'Brot & Backwaren', C: 'Getreide', D: 'Backwaren', E: 'Eier', F: 'Obst & Säfte',
  G: 'Gemüse', H: 'Hülsenfrüchte & Nüsse', K: 'Kartoffeln', M: 'Milchprodukte',
  N: 'Getränke', P: 'Alkohol', Q: 'Fette & Öle', R: 'Salz & Würze', S: 'Zucker & Süßes',
  T: 'Fisch', U: 'Fleisch', V: 'Gewürze', W: 'Wurst & Aufschnitt', X: 'Fertiggerichte', Y: 'Fertiggerichte',
}

export function groupOf(item: { source: string; category: string | null }): string {
  if (item.source === 'bls' && item.category && BLS_GROUPS[item.category]) return BLS_GROUPS[item.category]!
  return 'Sonstiges'
}

/** Anzeige-Einheit eines Lebensmittels: Getränke ml, sonst g. */
export const unitOf = (f: { source?: string; category?: string | null; baseUnit?: string }): 'g' | 'ml' =>
  isDrink(f) ? 'ml' : 'g'

const DAY = 86_400_000
const startOfDay = (ms: number): number => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }

/** ms-Epoch → 'YYYY-MM-DD' fürs <input type="date">; '' bei null. */
export function dateValue(ms: number | null): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' → ms-Epoch (lokale Mittagszeit, TZ-robust); null bei leer/ungültig. */
export function parseDate(s: string): number | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12, 0, 0).getTime()
}

/** Heute + n Tage, als ms-Epoch (lokale Mittagszeit). */
export function inDays(n: number): number {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.getTime() + n * DAY
}

export function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/** Ampel-Klasse fürs MHD: rot abgelaufen, gelb ≤3 Tage, grün sonst. */
export function expiryClass(ms: number | null): string {
  if (!ms) return ''
  const days = Math.floor((startOfDay(ms) - startOfDay(Date.now())) / DAY)
  if (days < 0) return 'exp-red'
  if (days <= 3) return 'exp-yellow'
  return 'exp-green'
}

/** Kurzlabel fürs MHD: „Abgelaufen / Heute / Morgen / in N Tagen / MHD dd.mm.yyyy". */
export function expiryLabel(ms: number | null): string {
  if (!ms) return ''
  const days = Math.floor((startOfDay(ms) - startOfDay(Date.now())) / DAY)
  if (days < 0) return 'Abgelaufen'
  if (days === 0) return 'Heute'
  if (days === 1) return 'Morgen'
  if (days <= 7) return `in ${days} Tagen`
  return `MHD ${fmtDate(ms)}`
}
