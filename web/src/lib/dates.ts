// Datums-Helfer fürs Tagebuch: alles arbeitet auf lokalen YYYY-MM-DD-Strings
// (Europe/Berlin kommt vom Gerät — die App läuft im Gerätekontext des Nutzers).

export function todayStr(): string {
  return new Date().toLocaleDateString('en-CA')
}

export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00`) // noon avoids DST edge cases
  d.setDate(d.getDate() + delta)
  return d.toLocaleDateString('en-CA')
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y!, (m! - 1) + delta, 1, 12)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.']
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember']

/** "Heute" / "Gestern" / "Morgen" / "Mo., 9. Juni" */
export function dayLabel(date: string): string {
  const today = todayStr()
  if (date === today) return 'Heute'
  if (date === addDays(today, -1)) return 'Gestern'
  if (date === addDays(today, 1)) return 'Morgen'
  const d = new Date(`${date}T12:00:00`)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m! - 1]} ${y}`
}

/** Kalendergitter eines Monats: führende Lücken (Mo-Start) + alle Tage. */
export function monthGrid(month: string): { leading: number; days: string[] } {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y!, m! - 1, 1, 12)
  const leading = (first.getDay() + 6) % 7 // Mo = 0
  const count = new Date(y!, m!, 0).getDate()
  const days = Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`)
  return { leading, days }
}
