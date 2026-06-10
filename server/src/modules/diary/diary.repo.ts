import { and, asc, eq, sql } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { diaryEntries, waterEntries } from '../../db/schema.js'

export type DiaryEntryRow = typeof diaryEntries.$inferSelect
export type NewDiaryEntry = typeof diaryEntries.$inferInsert
export type WaterEntryRow = typeof waterEntries.$inferSelect

export function insertEntries(db: DB, entries: NewDiaryEntry[]): void {
  if (entries.length === 0) return
  db.insert(diaryEntries).values(entries).run()
}

export function getEntry(db: DB, userId: string, id: string): DiaryEntryRow | null {
  return (
    db
      .select()
      .from(diaryEntries)
      .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
      .get() ?? null
  )
}

export function listDayEntries(db: DB, userId: string, date: string): DiaryEntryRow[] {
  return db
    .select()
    .from(diaryEntries)
    .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.date, date)))
    .orderBy(asc(diaryEntries.createdAt))
    .all()
}

export interface DayTotals {
  kcal: number
  protein: number
  fat: number
  carbs: number
  sugar: number
  fiber: number
}

export function dayTotals(db: DB, userId: string, date: string): DayTotals {
  const row = db
    .select({
      kcal: sql<number>`COALESCE(SUM(${diaryEntries.kcal}), 0)`,
      protein: sql<number>`COALESCE(SUM(${diaryEntries.protein}), 0)`,
      fat: sql<number>`COALESCE(SUM(${diaryEntries.fat}), 0)`,
      carbs: sql<number>`COALESCE(SUM(${diaryEntries.carbs}), 0)`,
      sugar: sql<number>`COALESCE(SUM(${diaryEntries.sugar}), 0)`,
      fiber: sql<number>`COALESCE(SUM(${diaryEntries.fiber}), 0)`,
    })
    .from(diaryEntries)
    .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.date, date)))
    .get()
  const r = (x: number) => Math.round(x * 10) / 10
  return {
    kcal: r(row?.kcal ?? 0),
    protein: r(row?.protein ?? 0),
    fat: r(row?.fat ?? 0),
    carbs: r(row?.carbs ?? 0),
    sugar: r(row?.sugar ?? 0),
    fiber: r(row?.fiber ?? 0),
  }
}

/** kcal sums per day for one month ("YYYY-MM") — feeds the calendar overview. */
export function monthKcalByDay(db: DB, userId: string, month: string): { date: string; kcal: number }[] {
  return db
    .select({
      date: diaryEntries.date,
      kcal: sql<number>`COALESCE(SUM(${diaryEntries.kcal}), 0)`,
    })
    .from(diaryEntries)
    .where(and(eq(diaryEntries.userId, userId), sql`${diaryEntries.date} LIKE ${month + '-%'}`))
    .groupBy(diaryEntries.date)
    .all()
    .map((r) => ({ date: r.date, kcal: Math.round(r.kcal) }))
}

export function updateEntryRow(
  db: DB,
  userId: string,
  id: string,
  set: Partial<Pick<DiaryEntryRow, 'date' | 'daytime' | 'amountG' | 'kcal' | 'protein' | 'fat' | 'carbs' | 'sugar' | 'fiber' | 'mirrorStatus' | 'mirrorJson'>>,
): boolean {
  const res = db
    .update(diaryEntries)
    .set({ ...set, updatedAt: Date.now() })
    .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
    .run()
  return res.changes > 0
}

export function deleteEntryRow(db: DB, userId: string, id: string): boolean {
  const res = db
    .delete(diaryEntries)
    .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
    .run()
  return res.changes > 0
}

/** Mirror bookkeeping is system-internal: id-scoped, not user-scoped. */
export function setMirrorState(db: DB, id: string, status: string, json: unknown): void {
  db.update(diaryEntries)
    .set({ mirrorStatus: status, mirrorJson: JSON.stringify(json), updatedAt: Date.now() })
    .where(eq(diaryEntries.id, id))
    .run()
}

export function listPendingMirrors(db: DB, userId: string, ids: string[]): DiaryEntryRow[] {
  if (ids.length === 0) return []
  return db
    .select()
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.userId, userId),
        eq(diaryEntries.mirrorStatus, 'pending'),
        sql`${diaryEntries.id} IN ${ids}`,
      ),
    )
    .all()
}

// --- water ----------------------------------------------------------------

export function addWater(db: DB, userId: string, date: string, ml: number, id: string): WaterEntryRow {
  db.insert(waterEntries).values({ id, userId, date, ml, createdAt: Date.now() }).run()
  return db.select().from(waterEntries).where(eq(waterEntries.id, id)).get()!
}

export function deleteWater(db: DB, userId: string, id: string): boolean {
  const res = db
    .delete(waterEntries)
    .where(and(eq(waterEntries.id, id), eq(waterEntries.userId, userId)))
    .run()
  return res.changes > 0
}

export function listDayWater(db: DB, userId: string, date: string): WaterEntryRow[] {
  return db
    .select()
    .from(waterEntries)
    .where(and(eq(waterEntries.userId, userId), eq(waterEntries.date, date)))
    .orderBy(asc(waterEntries.createdAt))
    .all()
}

export function dayWaterTotal(db: DB, userId: string, date: string): number {
  const row = db
    .select({ total: sql<number>`COALESCE(SUM(${waterEntries.ml}), 0)` })
    .from(waterEntries)
    .where(and(eq(waterEntries.userId, userId), eq(waterEntries.date, date)))
    .get()
  return row?.total ?? 0
}
