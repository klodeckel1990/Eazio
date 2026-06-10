import { describe, it, expect } from 'vitest'
import { computePlan } from './plan.service.js'

const NOW = new Date('2026-06-10T12:00:00')

describe('computePlan', () => {
  it('computes Mifflin-St Jeor BMR and TDEE for a male profile', () => {
    const plan = computePlan(
      {
        gender: 'male',
        birthYear: 1990, // 36
        heightCm: 180,
        weightKg: 85,
        activityLevel: 'moderate',
        goalType: 'maintain',
      },
      NOW,
    )
    // 10×85 + 6.25×180 − 5×36 + 5 = 1800
    expect(plan.bmr).toBe(1800)
    expect(plan.tdee).toBe(2790) // ×1.55
    expect(plan.kcalTarget).toBe(2790)
    expect(plan.etaWeeks).toBeNull()
  })

  it('applies the weekly pace as a daily deficit with an ETA', () => {
    const plan = computePlan(
      {
        gender: 'male',
        birthYear: 1990,
        heightCm: 180,
        weightKg: 85,
        activityLevel: 'moderate',
        goalType: 'lose',
        weightGoalKg: 78,
        paceKgWeek: 0.5,
      },
      NOW,
    )
    // 2790 − 550 = 2240
    expect(plan.kcalTarget).toBe(2240)
    expect(plan.etaWeeks).toBe(14) // 7 kg / 0.5
    expect(plan.proteinG).toBe(153) // 1.8 g/kg
    // macros add back up to roughly the target
    expect(plan.proteinG * 4 + plan.fatG * 9 + plan.carbsG * 4).toBeGreaterThan(plan.kcalTarget - 50)
  })

  it('never plans below the safety floor', () => {
    const plan = computePlan(
      {
        gender: 'female',
        birthYear: 2000,
        heightCm: 160,
        weightKg: 52,
        activityLevel: 'sedentary',
        goalType: 'lose',
        weightGoalKg: 48,
        paceKgWeek: 1.0,
      },
      NOW,
    )
    expect(plan.kcalTarget).toBeGreaterThanOrEqual(1200)
    expect(plan.kcalTarget).toBeGreaterThanOrEqual(Math.round(plan.bmr * 0.85 / 10) * 10)
  })

  it('adds a surplus for muscle gain and scales water with weight', () => {
    const plan = computePlan(
      {
        gender: 'diverse',
        birthYear: 1995,
        heightCm: 175,
        weightKg: 70,
        activityLevel: 'active',
        goalType: 'gain',
        weightGoalKg: 75,
        paceKgWeek: 0.25,
      },
      NOW,
    )
    expect(plan.kcalTarget).toBeGreaterThan(plan.tdee)
    expect(plan.waterMl).toBe(2500) // 70 × 35 = 2450 → 2500
    expect(plan.etaWeeks).toBe(20)
  })
})
