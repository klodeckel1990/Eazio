import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { userGoals } from '../../db/schema.js'

export interface Goals {
  kcalTarget: number
  proteinG: number | null
  fatG: number | null
  carbsG: number | null
  waterMl: number
  weightKg: number | null
  weightGoalKg: number | null
}

export const DEFAULT_GOALS: Goals = {
  kcalTarget: 2000,
  proteinG: null,
  fatG: null,
  carbsG: null,
  waterMl: 2000,
  weightKg: null,
  weightGoalKg: null,
}

export function getGoals(db: DB, userId: string): Goals {
  const row = db.select().from(userGoals).where(eq(userGoals.userId, userId)).get()
  if (!row) return { ...DEFAULT_GOALS }
  return {
    kcalTarget: row.kcalTarget,
    proteinG: row.proteinG,
    fatG: row.fatG,
    carbsG: row.carbsG,
    waterMl: row.waterMl,
    weightKg: row.weightKg,
    weightGoalKg: row.weightGoalKg,
  }
}

export function updateGoals(db: DB, userId: string, patch: Partial<Goals>): Goals {
  const next = { ...getGoals(db, userId), ...patch }
  db.insert(userGoals)
    .values({ userId, ...next, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: userGoals.userId,
      set: { ...next, updatedAt: Date.now() },
    })
    .run()
  return next
}
