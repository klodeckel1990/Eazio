import { describe, it, expect } from 'vitest'
import { resolveDaytime, dateInTz, hourInTz, type Daytime } from './daytime.js'

const at = (iso: string) => new Date(iso)

describe('daytime', () => {
  it('reads the hour and date in a timezone', () => {
    expect(hourInTz(at('2026-06-08T08:30:00Z'), 'UTC')).toBe(8)
    expect(dateInTz(at('2026-06-08T23:30:00Z'), 'UTC')).toBe('2026-06-08')
    expect(dateInTz(at('2026-06-08T23:30:00Z'), 'Asia/Tokyo')).toBe('2026-06-09')
    expect(hourInTz(at('2026-06-08T00:00:00Z'), 'UTC')).toBe(0)
  })

  it('maps the hour to a daytime via default windows', () => {
    const d = (iso: string): Daytime => resolveDaytime(at(iso), 'UTC')
    expect(d('2026-06-08T08:00:00Z')).toBe('breakfast')
    expect(d('2026-06-08T13:00:00Z')).toBe('lunch')
    expect(d('2026-06-08T18:00:00Z')).toBe('dinner')
    expect(d('2026-06-08T23:00:00Z')).toBe('snack')
    expect(d('2026-06-08T03:00:00Z')).toBe('snack')
  })

  it('honours the half-open window boundaries', () => {
    const d = (iso: string): Daytime => resolveDaytime(at(iso), 'UTC')
    expect(d('2026-06-08T05:00:00Z')).toBe('breakfast') // start inclusive
    expect(d('2026-06-08T11:00:00Z')).toBe('lunch') // breakfast end exclusive
    expect(d('2026-06-08T15:00:00Z')).toBe('dinner') // lunch end exclusive
    expect(d('2026-06-08T21:00:00Z')).toBe('snack') // dinner end exclusive
    expect(d('2026-06-08T00:00:00Z')).toBe('snack')
  })

  it('applies the timezone offset incl. DST', () => {
    // Berlin is UTC+2 in June (DST) → 08:00 local
    expect(resolveDaytime(at('2026-06-08T06:00:00Z'), 'Europe/Berlin')).toBe('breakfast')
    // Berlin is UTC+1 in January → 07:00 local
    expect(resolveDaytime(at('2026-01-08T06:00:00Z'), 'Europe/Berlin')).toBe('breakfast')
    expect(hourInTz(at('2026-06-08T06:00:00Z'), 'Europe/Berlin')).toBe(8)
  })
})
