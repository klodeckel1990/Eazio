import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { dateInTz, resolveDaytime, type Daytime } from '../meals/daytime.js'
import { getFoodById, upsertCachedMatch } from '../foods/foods.repo.js'
import { upsertFoodAlias } from '../foods/food-aliases.repo.js'
import { normalizeName } from '../matching/normalize.js'
import { getSettings } from '../settings/settings.repo.js'
import { getDefaultAccount } from '../accounts/accounts.repo.js'
import { getGoals, type Goals } from '../goals/goals.repo.js'
import { getStreak, updateStreakOnLog, type Streak } from './streak.js'
import { mirrorEntries, unmirrorEntry, type ClientFactory } from './mirror.service.js'
import {
  dayTotals,
  dayWaterTotal,
  deleteEntryRow,
  getEntry,
  insertEntries,
  listDayEntries,
  listDayWater,
  updateEntryRow,
  type DayTotals,
  type DiaryEntryRow,
  type NewDiaryEntry,
} from './diary.repo.js'

export type DiaryOrigin = 'manual' | 'recipe' | 'preset' | 'photo' | 'yazio_import'

export interface DiaryLineInput {
  /** Reference into the foods table; nutrient snapshot is computed from it. */
  foodId?: string
  /** Free-form fallback: explicit name + nutrient values for amountG. */
  name?: string
  kcal?: number
  protein?: number | null
  fat?: number | null
  carbs?: number | null
  sugar?: number | null
  fiber?: number | null
  amountG: number
  servingLabel?: string | null
  servingQuantity?: number | null
  /** The text the user typed (alias learning maps it to the chosen food). */
  rawText?: string
}

export interface CreateEntriesInput {
  date?: string
  daytime?: Daytime
  origin?: DiaryOrigin
  originRefId?: string | null
  lines: DiaryLineInput[]
}

export class FoodNotFoundError extends Error {
  constructor(public foodId: string) {
    super(`food not found: ${foodId}`)
    this.name = 'FoodNotFoundError'
  }
}

const r1 = (x: number): number => Math.round(x * 10) / 10
const scale = (per100: number | null, amountG: number): number | null =>
  per100 === null ? null : r1((per100 * amountG) / 100)

export interface CreateEntriesResult {
  date: string
  daytime: Daytime
  entries: DiaryEntryRow[]
  streak: Streak
  mirrorQueued: boolean
}

export interface CreateEntriesOptions {
  clientFactory?: ClientFactory
  /** Tests set this to false and run mirrorEntries() explicitly. */
  queueMirror?: boolean
}

export function createEntries(
  db: DB,
  userId: string,
  input: CreateEntriesInput,
  opts: CreateEntriesOptions = {},
): CreateEntriesResult {
  const now = new Date()
  const date = input.date ?? dateInTz(now, env.TZ)
  const daytime = input.daytime ?? resolveDaytime(now, env.TZ)
  const origin = input.origin ?? 'manual'

  const mirrorOn = getSettings(db, userId).mirrorToYazio && getDefaultAccount(db, userId) != null

  const rows: NewDiaryEntry[] = input.lines.map((line) => {
    const ts = Date.now()
    const base = {
      id: randomUUID(),
      userId,
      date,
      daytime,
      amountG: line.amountG,
      servingLabel: line.servingLabel ?? null,
      servingQuantity: line.servingQuantity ?? null,
      origin,
      originRefId: input.originRefId ?? null,
      mirrorStatus: mirrorOn ? 'pending' : null,
      createdAt: ts,
      updatedAt: ts,
    }
    if (line.foodId) {
      const food = getFoodById(db, line.foodId, userId)
      if (!food) throw new FoodNotFoundError(line.foodId)
      return {
        ...base,
        foodId: food.id,
        nameSnapshot: food.name,
        kcal: scale(food.kcal, line.amountG) ?? 0,
        protein: scale(food.protein, line.amountG),
        fat: scale(food.fat, line.amountG),
        carbs: scale(food.carbs, line.amountG),
        sugar: scale(food.sugar, line.amountG),
        fiber: scale(food.fiber, line.amountG),
      }
    }
    // free-form line: values are already "for amountG" (route schema enforces name+kcal)
    return {
      ...base,
      foodId: null,
      nameSnapshot: line.name!,
      kcal: r1(line.kcal!),
      protein: line.protein ?? null,
      fat: line.fat ?? null,
      carbs: line.carbs ?? null,
      sugar: line.sugar ?? null,
      fiber: line.fiber ?? null,
    }
  })

  let streak: Streak
  db.transaction((tx) => {
    const txDb = tx as unknown as DB
    insertEntries(txDb, rows)
    for (let i = 0; i < rows.length; i++) {
      const line = input.lines[i]!
      const row = rows[i]!
      if (row.foodId && line.rawText) {
        const normalized = normalizeName(line.rawText)
        upsertFoodAlias(txDb, userId, normalized, {
          foodId: row.foodId,
          defaultAmountG: line.amountG,
          defaultServingLabel: line.servingLabel ?? null,
        })
        // a human's confirmed choice outranks any LLM guess — promote it to
        // the global match memory (shared foods only, custom stays private)
        const food = getFoodById(txDb, row.foodId, userId)
        if (food && food.source !== 'custom') {
          upsertCachedMatch(txDb, normalized, row.foodId)
        }
      }
    }
    streak = updateStreakOnLog(txDb, userId, date)
  })

  const ids = rows.map((rw) => rw.id!)
  if (mirrorOn && opts.queueMirror !== false) {
    setImmediate(() => {
      mirrorEntries(db, userId, ids, opts.clientFactory).catch(() => {})
    })
  }

  const entries = ids
    .map((id) => getEntry(db, userId, id))
    .filter((e): e is DiaryEntryRow => e !== null)
  return { date, daytime, entries, streak: streak!, mirrorQueued: mirrorOn }
}

export interface UpdateEntryPatch {
  amountG?: number
  daytime?: Daytime
  date?: string
}

/** Local-only edit; an already-mirrored Yazio item is not rewritten. */
export function updateEntry(
  db: DB,
  userId: string,
  id: string,
  patch: UpdateEntryPatch,
): DiaryEntryRow | null {
  const entry = getEntry(db, userId, id)
  if (!entry) return null
  const set: Parameters<typeof updateEntryRow>[3] = {}
  if (patch.daytime) set.daytime = patch.daytime
  if (patch.date) set.date = patch.date
  if (patch.amountG !== undefined && patch.amountG !== entry.amountG && entry.amountG > 0) {
    const ratio = patch.amountG / entry.amountG
    set.amountG = patch.amountG
    set.kcal = r1(entry.kcal * ratio)
    set.protein = entry.protein === null ? null : r1(entry.protein * ratio)
    set.fat = entry.fat === null ? null : r1(entry.fat * ratio)
    set.carbs = entry.carbs === null ? null : r1(entry.carbs * ratio)
    set.sugar = entry.sugar === null ? null : r1(entry.sugar * ratio)
    set.fiber = entry.fiber === null ? null : r1(entry.fiber * ratio)
  }
  updateEntryRow(db, userId, id, set)
  return getEntry(db, userId, id)
}

export function deleteEntry(
  db: DB,
  userId: string,
  id: string,
  clientFactory?: ClientFactory,
): boolean {
  const entry = getEntry(db, userId, id)
  if (!entry) return false
  deleteEntryRow(db, userId, id)
  if (entry.mirrorStatus === 'mirrored') {
    setImmediate(() => {
      unmirrorEntry(db, userId, entry, clientFactory).catch(() => {})
    })
  }
  return true
}

export interface DiaryDay {
  date: string
  defaultDaytime: Daytime
  entries: DiaryEntryRow[]
  totals: DayTotals
  goals: Goals
  remainingKcal: number
  water: { totalMl: number; entries: { id: string; ml: number }[] }
  streak: Streak
}

export function getDay(db: DB, userId: string, date?: string): DiaryDay {
  const now = new Date()
  const d = date ?? dateInTz(now, env.TZ)
  const totals = dayTotals(db, userId, d)
  const goals = getGoals(db, userId)
  return {
    date: d,
    defaultDaytime: resolveDaytime(now, env.TZ),
    entries: listDayEntries(db, userId, d),
    totals,
    goals,
    remainingKcal: Math.round(goals.kcalTarget - totals.kcal),
    water: {
      totalMl: dayWaterTotal(db, userId, d),
      entries: listDayWater(db, userId, d).map((w) => ({ id: w.id, ml: w.ml })),
    },
    streak: getStreak(db, userId),
  }
}

export interface WidgetSummary {
  date: string
  kcalTarget: number
  kcalConsumed: number
  kcalRemaining: number
  protein: number
  fat: number
  carbs: number
  waterMl: number
  waterTargetMl: number
  streak: number
}

/** Compact payload for home-screen widgets — a handful of indexed queries. */
export function getWidgetSummary(db: DB, userId: string, date?: string): WidgetSummary {
  const d = date ?? dateInTz(new Date(), env.TZ)
  const totals = dayTotals(db, userId, d)
  const goals = getGoals(db, userId)
  const streak = getStreak(db, userId)
  return {
    date: d,
    kcalTarget: goals.kcalTarget,
    kcalConsumed: Math.round(totals.kcal),
    kcalRemaining: Math.round(goals.kcalTarget - totals.kcal),
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    waterMl: dayWaterTotal(db, userId, d),
    waterTargetMl: goals.waterMl,
    streak: streak.currentStreak,
  }
}
