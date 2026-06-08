export type Daytime = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface DaytimeWindows {
  breakfast: [number, number]
  lunch: [number, number]
  dinner: [number, number]
}

export const DEFAULT_WINDOWS: DaytimeWindows = {
  breakfast: [5, 11],
  lunch: [11, 15],
  dinner: [15, 21],
}

export function hourInTz(now: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now)
  return parseInt(h, 10)
}

export function dateInTz(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function resolveDaytime(now: Date, tz: string, w: DaytimeWindows = DEFAULT_WINDOWS): Daytime {
  const h = hourInTz(now, tz)
  if (h >= w.breakfast[0] && h < w.breakfast[1]) return 'breakfast'
  if (h >= w.lunch[0] && h < w.lunch[1]) return 'lunch'
  if (h >= w.dinner[0] && h < w.dinner[1]) return 'dinner'
  return 'snack'
}

export const DAYTIMES: readonly Daytime[] = ['breakfast', 'lunch', 'dinner', 'snack']
