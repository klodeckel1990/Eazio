import { and, eq, gte, sql } from 'drizzle-orm'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { activityDays, diaryEntries, foods, waterEntries } from '../../db/schema.js'
import { dateInTz } from '../meals/daytime.js'
import { getGoals, type Goals } from '../goals/goals.repo.js'
import { getStreak, previousDay, type Streak } from './streak.js'

export interface StatsDay {
  date: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  waterMl: number
  entryCount: number
  /** Apple Health / Health Connect (null = kein Sync an dem Tag) */
  steps: number | null
  activeKcal: number | null
  weightKg: number | null
}

export interface StatsAverages {
  kcal: number
  protein: number
  fat: number
  carbs: number
  waterMl: number
  /** über Tage mit Sync; null wenn keine Daten im Zeitraum */
  steps: number | null
  activeKcal: number | null
}

export interface StatsResult {
  /** Oldest → newest, one element per calendar day, zero-filled. */
  days: StatsDay[]
  goals: Goals
  streak: Streak
  /** Averages over logged days only (days without entries don't drag it down). */
  avg: StatsAverages
  daysLogged: number
}

const r1 = (x: number): number => Math.round(x * 10) / 10

/** Day-by-day totals for the last `count` days (including today). */
export function getStats(db: DB, userId: string, count: number): StatsResult {
  const today = dateInTz(new Date(), env.TZ)
  const dates: string[] = [today]
  while (dates.length < count) dates.unshift(previousDay(dates[0]!))
  const from = dates[0]!

  const foodRows = db
    .select({
      date: diaryEntries.date,
      kcal: sql<number>`SUM(${diaryEntries.kcal})`,
      protein: sql<number>`COALESCE(SUM(${diaryEntries.protein}), 0)`,
      fat: sql<number>`COALESCE(SUM(${diaryEntries.fat}), 0)`,
      carbs: sql<number>`COALESCE(SUM(${diaryEntries.carbs}), 0)`,
      entryCount: sql<number>`COUNT(*)`,
    })
    .from(diaryEntries)
    .where(and(eq(diaryEntries.userId, userId), gte(diaryEntries.date, from)))
    .groupBy(diaryEntries.date)
    .all()
  const waterRows = db
    .select({ date: waterEntries.date, ml: sql<number>`SUM(${waterEntries.ml})` })
    .from(waterEntries)
    .where(and(eq(waterEntries.userId, userId), gte(waterEntries.date, from)))
    .groupBy(waterEntries.date)
    .all()
  // getrackte Getränke (baseUnit='ml') zählen wie auf dem Tagebuch zum Wasser
  const drinkRows = db
    .select({ date: diaryEntries.date, ml: sql<number>`SUM(${diaryEntries.amountG})` })
    .from(diaryEntries)
    .innerJoin(foods, eq(diaryEntries.foodId, foods.id))
    .where(and(eq(diaryEntries.userId, userId), gte(diaryEntries.date, from), eq(foods.baseUnit, 'ml')))
    .groupBy(diaryEntries.date)
    .all()

  const activityRows = db
    .select()
    .from(activityDays)
    .where(and(eq(activityDays.userId, userId), gte(activityDays.date, from)))
    .all()

  const food = new Map(foodRows.map((row) => [row.date, row]))
  const water = new Map(waterRows.map((row) => [row.date, row.ml]))
  const drinks = new Map(drinkRows.map((row) => [row.date, Math.round(row.ml)]))
  const activity = new Map(activityRows.map((row) => [row.date, row]))

  const days: StatsDay[] = dates.map((date) => {
    const f = food.get(date)
    return {
      date,
      kcal: r1(f?.kcal ?? 0),
      protein: r1(f?.protein ?? 0),
      fat: r1(f?.fat ?? 0),
      carbs: r1(f?.carbs ?? 0),
      waterMl: (water.get(date) ?? 0) + (drinks.get(date) ?? 0),
      entryCount: f?.entryCount ?? 0,
      steps: activity.get(date)?.steps ?? null,
      activeKcal: activity.get(date)?.activeKcal ?? null,
      weightKg: activity.get(date)?.weightKg ?? null,
    }
  })

  const logged = days.filter((d) => d.entryCount > 0)
  const avgOf = (pick: (d: StatsDay) => number): number =>
    logged.length === 0 ? 0 : r1(logged.reduce((s, d) => s + pick(d), 0) / logged.length)

  return {
    days,
    goals: getGoals(db, userId),
    streak: getStreak(db, userId),
    avg: {
      kcal: Math.round(avgOf((d) => d.kcal)),
      protein: avgOf((d) => d.protein),
      fat: avgOf((d) => d.fat),
      carbs: avgOf((d) => d.carbs),
      waterMl: Math.round(avgOf((d) => d.waterMl)),
      steps: avgNullable(days, (d) => d.steps),
      activeKcal: avgNullable(days, (d) => d.activeKcal),
    },
    daysLogged: logged.length,
  }
}

function avgNullable(days: StatsDay[], pick: (d: StatsDay) => number | null): number | null {
  const vals = days.map(pick).filter((v): v is number => v !== null && v > 0)
  if (vals.length === 0) return null
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
}
