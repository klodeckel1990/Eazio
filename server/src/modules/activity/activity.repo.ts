import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { activityDays } from '../../db/schema.js'

export interface ActivityDay {
  date: string
  steps: number | null
  activeKcal: number | null
  weightKg: number | null
}

export interface ActivityPatch {
  steps?: number | null
  activeKcal?: number | null
  weightKg?: number | null
}

export function getActivityDay(db: DB, userId: string, date: string): ActivityDay | null {
  const row = db
    .select()
    .from(activityDays)
    .where(and(eq(activityDays.userId, userId), eq(activityDays.date, date)))
    .get()
  if (!row) return null
  return { date: row.date, steps: row.steps, activeKcal: row.activeKcal, weightKg: row.weightKg }
}

/** Upsert merge: undefined keeps the stored value, null clears it. */
export function upsertActivityDay(
  db: DB,
  userId: string,
  date: string,
  patch: ActivityPatch,
): ActivityDay {
  const existing = getActivityDay(db, userId, date)
  const next = {
    steps: patch.steps !== undefined ? patch.steps : (existing?.steps ?? null),
    activeKcal: patch.activeKcal !== undefined ? patch.activeKcal : (existing?.activeKcal ?? null),
    weightKg: patch.weightKg !== undefined ? patch.weightKg : (existing?.weightKg ?? null),
  }
  db.insert(activityDays)
    .values({ userId, date, ...next, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: [activityDays.userId, activityDays.date],
      set: { ...next, updatedAt: Date.now() },
    })
    .run()
  return { date, ...next }
}
