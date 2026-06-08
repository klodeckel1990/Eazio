import { describe, it, expect } from 'vitest'
import { normalizeName } from './normalize.js'

describe('normalizeName', () => {
  it('lowercases, strips accents, collapses whitespace', () => {
    expect(normalizeName('  Haferflocken ')).toBe('haferflocken')
    expect(normalizeName('Müsli   Crunchy')).toBe('musli crunchy')
    expect(normalizeName('Café')).toBe('cafe')
    expect(normalizeName('Straße')).toBe('strasse')
  })
})
