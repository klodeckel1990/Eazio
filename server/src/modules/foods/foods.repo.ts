import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { foods, matchCache, offContributions } from '../../db/schema.js'
import { buildFtsQuery, buildSearchTerms } from './search-terms.js'

export type FoodRow = typeof foods.$inferSelect
export type NewFood = typeof foods.$inferInsert

export interface ServingDef {
  label: string
  grams: number
}

/** Insert or refresh a sourced food (BLS import, OFF cache) keyed by (source, sourceId). */
export function upsertSourcedFood(db: DB, food: NewFood): void {
  db.insert(foods)
    .values(food)
    .onConflictDoUpdate({
      target: [foods.source, foods.sourceId],
      set: {
        barcode: food.barcode ?? null,
        name: food.name,
        brand: food.brand ?? null,
        category: food.category ?? null,
        searchTerms: food.searchTerms ?? null,
        baseUnit: food.baseUnit ?? 'g',
        kcal: food.kcal,
        protein: food.protein ?? null,
        fat: food.fat ?? null,
        saturatedFat: food.saturatedFat ?? null,
        carbs: food.carbs ?? null,
        sugar: food.sugar ?? null,
        fiber: food.fiber ?? null,
        salt: food.salt ?? null,
        sodium: food.sodium ?? null,
        alcohol: food.alcohol ?? null,
        nutrientsJson: food.nutrientsJson ?? null,
        servingsJson: food.servingsJson ?? null,
        version: sql`${foods.version} + 1`,
        updatedAt: food.updatedAt,
      },
    })
    .run()
}

export interface CachedMatch {
  foodId: string
  pieceGrams: number | null
}

/** Global LLM-match memory: normalized ingredient name → shared food. */
export function getCachedMatch(db: DB, normalizedName: string): CachedMatch | null {
  const row = db
    .select({ foodId: matchCache.foodId, pieceGrams: matchCache.pieceGrams })
    .from(matchCache)
    .innerJoin(foods, eq(foods.id, matchCache.foodId))
    .where(and(eq(matchCache.normalizedName, normalizedName), isNull(foods.deletedAt)))
    .get()
  if (row) {
    db.update(matchCache)
      .set({ hits: sql`${matchCache.hits} + 1` })
      .where(eq(matchCache.normalizedName, normalizedName))
      .run()
  }
  return row ?? null
}

export function upsertCachedMatch(
  db: DB,
  normalizedName: string,
  foodId: string,
  pieceGrams?: number | null,
): void {
  const set: Record<string, unknown> = { foodId, updatedAt: Date.now() }
  // undefined keeps an existing estimate (human overrides carry no grams info)
  if (pieceGrams !== undefined) set.pieceGrams = pieceGrams
  db.insert(matchCache)
    .values({ normalizedName, foodId, pieceGrams: pieceGrams ?? null, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: matchCache.normalizedName,
      set,
    })
    .run()
}

/** Visibility rule everywhere: custom foods exist only for their owner. */
function visibleTo(userId: string) {
  return and(
    isNull(foods.deletedAt),
    sql`(${foods.source} != 'custom' OR ${foods.ownerUserId} = ${userId})`,
  )
}

export function getFoodById(db: DB, id: string, userId: string): FoodRow | null {
  const row = db
    .select()
    .from(foods)
    .where(and(eq(foods.id, id), visibleTo(userId)))
    .get()
  return row ?? null
}

/** Barcode hit preferring the user's own entry over shared off/bls rows. */
export function findFoodByBarcode(db: DB, barcode: string, userId: string): FoodRow | null {
  const row = db
    .select()
    .from(foods)
    .where(and(eq(foods.barcode, barcode), visibleTo(userId)))
    .orderBy(sql`CASE ${foods.source} WHEN 'custom' THEN 0 ELSE 1 END`)
    .limit(1)
    .get()
  return row ?? null
}

export interface RankedFood extends FoodRow {
  rank: number
}

/**
 * FTS5 search ranked by bm25 (name 10 / searchTerms 8 / brand 2 — searchTerms
 * close to name so split compounds like "Hafer Flocken" beat compound dishes
 * matching in the name) plus
 * a source boost (the user's custom foods first, curated BLS before the OFF
 * cache) and a small name-length penalty so base products ("Banane roh") beat
 * compound dishes. bm25 is negative-is-better, boosts subtract.
 */
export function searchFoods(db: DB, userId: string, query: string, limit: number): RankedFood[] {
  const match = buildFtsQuery(query)
  if (!match) return []
  return db.all<RankedFood>(sql`
    SELECT f.id, f.source, f.source_id AS sourceId, f.owner_user_id AS ownerUserId,
           f.barcode, f.name, f.brand, f.category, f.search_terms AS searchTerms,
           f.base_unit AS baseUnit, f.kcal, f.protein, f.fat, f.saturated_fat AS saturatedFat,
           f.carbs, f.sugar, f.fiber, f.salt, f.sodium, f.alcohol,
           f.nutrients_json AS nutrientsJson, f.servings_json AS servingsJson,
           f.version, f.deleted_at AS deletedAt, f.created_at AS createdAt, f.updated_at AS updatedAt,
           bm25(foods_fts, 10.0, 8.0, 2.0) AS rank
    FROM foods_fts
    JOIN foods f ON f.rowid = foods_fts.rowid
    WHERE foods_fts MATCH ${match}
      AND f.deleted_at IS NULL
      AND (f.source != 'custom' OR f.owner_user_id = ${userId})
    ORDER BY bm25(foods_fts, 10.0, 8.0, 2.0)
      + (CASE f.source WHEN 'custom' THEN -3.0 WHEN 'bls' THEN -1.0 ELSE 0.0 END)
      + length(f.name) * 0.02
    LIMIT ${limit}
  `)
}

export interface CustomFoodInput {
  name: string
  brand?: string | null
  barcode?: string | null
  baseUnit?: 'g' | 'ml'
  kcal: number
  protein?: number | null
  fat?: number | null
  saturatedFat?: number | null
  carbs?: number | null
  sugar?: number | null
  fiber?: number | null
  salt?: number | null
  servings?: ServingDef[]
}

export function createCustomFood(db: DB, userId: string, input: CustomFoodInput): FoodRow {
  const now = Date.now()
  const row: NewFood = {
    id: randomUUID(),
    source: 'custom',
    sourceId: null,
    ownerUserId: userId,
    barcode: input.barcode ?? null,
    name: input.name,
    brand: input.brand ?? null,
    searchTerms: buildSearchTerms(input.name, input.brand),
    baseUnit: input.baseUnit ?? 'g',
    kcal: input.kcal,
    protein: input.protein ?? null,
    fat: input.fat ?? null,
    saturatedFat: input.saturatedFat ?? null,
    carbs: input.carbs ?? null,
    sugar: input.sugar ?? null,
    fiber: input.fiber ?? null,
    salt: input.salt ?? null,
    servingsJson: input.servings?.length ? JSON.stringify(input.servings) : null,
    createdAt: now,
    updatedAt: now,
  }
  db.insert(foods).values(row).run()
  return db.select().from(foods).where(eq(foods.id, row.id)).get()!
}

function ownedCustom(id: string, userId: string) {
  return and(
    eq(foods.id, id),
    eq(foods.source, 'custom'),
    eq(foods.ownerUserId, userId),
    isNull(foods.deletedAt),
  )
}

export function updateCustomFood(
  db: DB,
  userId: string,
  id: string,
  patch: Partial<CustomFoodInput>,
): FoodRow | null {
  const existing = db.select().from(foods).where(ownedCustom(id, userId)).get()
  if (!existing) return null
  const name = patch.name ?? existing.name
  const brand = patch.brand === undefined ? existing.brand : patch.brand
  db.update(foods)
    .set({
      name,
      brand,
      barcode: patch.barcode === undefined ? existing.barcode : patch.barcode,
      baseUnit: patch.baseUnit ?? (existing.baseUnit as 'g' | 'ml'),
      kcal: patch.kcal ?? existing.kcal,
      protein: patch.protein === undefined ? existing.protein : patch.protein,
      fat: patch.fat === undefined ? existing.fat : patch.fat,
      saturatedFat: patch.saturatedFat === undefined ? existing.saturatedFat : patch.saturatedFat,
      carbs: patch.carbs === undefined ? existing.carbs : patch.carbs,
      sugar: patch.sugar === undefined ? existing.sugar : patch.sugar,
      fiber: patch.fiber === undefined ? existing.fiber : patch.fiber,
      salt: patch.salt === undefined ? existing.salt : patch.salt,
      servingsJson:
        patch.servings === undefined
          ? existing.servingsJson
          : patch.servings.length
            ? JSON.stringify(patch.servings)
            : null,
      searchTerms: buildSearchTerms(name, brand),
      version: existing.version + 1,
      updatedAt: Date.now(),
    })
    .where(ownedCustom(id, userId))
    .run()
  return db.select().from(foods).where(eq(foods.id, id)).get() ?? null
}

export function softDeleteCustomFood(db: DB, userId: string, id: string): boolean {
  const res = db
    .update(foods)
    .set({ deletedAt: Date.now(), updatedAt: Date.now() })
    .where(ownedCustom(id, userId))
    .run()
  return res.changes > 0
}

/** Beitragsstatus eines Produkts (für Idempotenz: bereits gesendet?). */
export function getOffContribution(db: DB, foodId: string): { status: string } | null {
  const row = db
    .select({ status: offContributions.status })
    .from(offContributions)
    .where(eq(offContributions.foodId, foodId))
    .get()
  return row ?? null
}

/** Protokolliert einen OFF-Beitrag (eine Zeile pro food, idempotent per foodId). */
export function recordOffContribution(
  db: DB,
  input: { userId: string; foodId: string; barcode: string; status: string; offStatus: string | null },
): void {
  const now = Date.now()
  db.insert(offContributions)
    .values({ id: randomUUID(), ...input, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: offContributions.foodId,
      set: { status: input.status, offStatus: input.offStatus, updatedAt: now },
    })
    .run()
}
