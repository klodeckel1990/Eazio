import { describe, it, expect } from 'vitest'
import { scaleNutrition } from './nutrition'

describe('scaleNutrition', () => {
  it('scales per-reference nutrients to grams', () => {
    const per = { kcal: 350, carb: 60, protein: 12, fat: 7 }
    expect(scaleNutrition(per, 100, 80)).toEqual({ kcal: 280, carb: 48, protein: 9.6, fat: 5.6 })
  })
  it('guards a zero reference amount', () => {
    expect(scaleNutrition({ kcal: 1, carb: 1, protein: 1, fat: 1 }, 0, 50)).toEqual({ kcal: 0, carb: 0, protein: 0, fat: 0 })
  })
})
