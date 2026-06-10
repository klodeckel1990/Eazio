// Turns the onboarding questionnaire into a daily plan: BMR via
// Mifflin-St Jeor, TDEE via activity factor, kcal target from the chosen
// weekly pace (1 kg body fat ≈ 7700 kcal), plus macro and water targets.
// Numbers are guidance, not medicine — the user can edit everything later.

export type Gender = 'female' | 'male' | 'diverse'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type GoalType = 'lose' | 'maintain' | 'gain'

export interface ProfileInput {
  gender: Gender
  birthYear: number
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goalType: GoalType
  weightGoalKg?: number | null
  /** kg per week to lose/gain; ignored for 'maintain' */
  paceKgWeek?: number | null
}

export interface Plan {
  bmr: number
  tdee: number
  kcalTarget: number
  proteinG: number
  fatG: number
  carbsG: number
  waterMl: number
  /** estimated weeks to reach weightGoalKg at the chosen pace; null if n/a */
  etaWeeks: number | null
}

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

// Mifflin-St Jeor constant: +5 male, −161 female; 'diverse' takes the midpoint.
const GENDER_OFFSET: Record<Gender, number> = { male: 5, female: -161, diverse: -78 }

export function computePlan(input: ProfileInput, now: Date = new Date()): Plan {
  const age = Math.min(Math.max(now.getFullYear() - input.birthYear, 14), 100)
  const bmr = Math.round(
    10 * input.weightKg + 6.25 * input.heightCm - 5 * age + GENDER_OFFSET[input.gender],
  )
  const tdee = Math.round(bmr * ACTIVITY_FACTORS[input.activityLevel])

  const pace = input.goalType === 'maintain' ? 0 : Math.abs(input.paceKgWeek ?? 0.5)
  const dailyDelta = Math.round((pace * 7700) / 7)
  let kcalTarget = input.goalType === 'lose' ? tdee - dailyDelta : tdee + dailyDelta
  // safety floor: never plan below 85 % of BMR or hard minimums
  const floor = Math.max(input.gender === 'male' ? 1500 : 1200, Math.round(bmr * 0.85))
  if (input.goalType === 'lose' && kcalTarget < floor) kcalTarget = floor
  kcalTarget = Math.round(kcalTarget / 10) * 10

  // protein per kg body weight by goal; fat 30 % of kcal; carbs fill the rest
  const proteinPerKg = input.goalType === 'lose' ? 1.8 : input.goalType === 'gain' ? 2.0 : 1.5
  const proteinG = Math.min(Math.round(input.weightKg * proteinPerKg), 250)
  const fatG = Math.round((kcalTarget * 0.3) / 9)
  const carbsG = Math.max(Math.round((kcalTarget - proteinG * 4 - fatG * 9) / 4), 0)

  const waterMl = Math.min(Math.max(Math.round((input.weightKg * 35) / 100) * 100, 1500), 4000)

  let etaWeeks: number | null = null
  if (input.goalType !== 'maintain' && input.weightGoalKg && pace > 0) {
    const diff = Math.abs(input.weightKg - input.weightGoalKg)
    etaWeeks = diff > 0 ? Math.max(Math.round(diff / pace), 1) : null
  }

  return { bmr, tdee, kcalTarget, proteinG, fatG, carbsG, waterMl, etaWeeks }
}
