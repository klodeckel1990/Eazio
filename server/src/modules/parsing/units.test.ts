import { describe, it, expect } from 'vitest'
import { resolveAmount } from './units.js'

describe('resolveAmount', () => {
  it('maps mass/volume units to grams', () => {
    expect(resolveAmount(80, 'g')).toEqual({ normalizedUnit: 'g', amountGrams: 80 })
    expect(resolveAmount(1.5, 'kg')).toEqual({ normalizedUnit: 'g', amountGrams: 1500 })
    expect(resolveAmount(200, 'ml')).toEqual({ normalizedUnit: 'ml', amountGrams: 200 })
    expect(resolveAmount(2, 'l')).toEqual({ normalizedUnit: 'ml', amountGrams: 2000 })
  })
  it('treats piece/unknown/none as a serving (grams resolved later)', () => {
    expect(resolveAmount(1, null)).toEqual({ normalizedUnit: 'serving', amountGrams: null })
    expect(resolveAmount(2, 'el')).toEqual({ normalizedUnit: 'serving', amountGrams: null })
    expect(resolveAmount(null, null)).toEqual({ normalizedUnit: 'serving', amountGrams: null })
  })
})
