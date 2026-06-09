import type { DB } from '../../db/client.js'
import {
  findFoodByBarcode,
  getFoodById,
  searchFoods as searchRepo,
  upsertSourcedFood,
  type FoodRow,
  type ServingDef,
} from './foods.repo.js'
import { fetchOffProduct, type FetchOffProduct } from './off.client.js'
import { mapOffProduct } from './off.mapper.js'

// Cached OFF rows older than this are refreshed in the background on access.
const OFF_REFRESH_MS = 1000 * 60 * 60 * 24 * 30

export interface FoodSummary {
  id: string
  source: string
  name: string
  brand: string | null
  category: string | null
  barcode: string | null
  baseUnit: string
  kcal: number
  protein: number | null
  fat: number | null
  saturatedFat: number | null
  carbs: number | null
  sugar: number | null
  fiber: number | null
  salt: number | null
  servings: ServingDef[]
  isOwn: boolean
}

export interface FoodDetail extends FoodSummary {
  sodium: number | null
  alcohol: number | null
  nutrients: Record<string, unknown> | null
}

export function toSummary(row: FoodRow, userId: string): FoodSummary {
  return {
    id: row.id,
    source: row.source,
    name: row.name,
    brand: row.brand,
    category: row.category,
    barcode: row.barcode,
    baseUnit: row.baseUnit,
    kcal: row.kcal,
    protein: row.protein,
    fat: row.fat,
    saturatedFat: row.saturatedFat,
    carbs: row.carbs,
    sugar: row.sugar,
    fiber: row.fiber,
    salt: row.salt,
    servings: parseJson<ServingDef[]>(row.servingsJson) ?? [],
    isOwn: row.source === 'custom' && row.ownerUserId === userId,
  }
}

export function toDetail(row: FoodRow, userId: string): FoodDetail {
  return {
    ...toSummary(row, userId),
    sodium: row.sodium,
    alcohol: row.alcohol,
    nutrients: parseJson<Record<string, unknown>>(row.nutrientsJson),
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function search(db: DB, userId: string, query: string, limit: number): FoodSummary[] {
  return searchRepo(db, userId, query, limit).map((row) => toSummary(row, userId))
}

export function getFood(db: DB, userId: string, id: string): FoodDetail | null {
  const row = getFoodById(db, id, userId)
  return row ? toDetail(row, userId) : null
}

/**
 * Barcode resolution: local cache first (the user's own entry wins), then OFF.
 * A stale cached OFF row is returned immediately and refreshed best-effort in
 * the background; OFF being down only matters on a cache miss.
 */
export async function lookupBarcode(
  db: DB,
  userId: string,
  ean: string,
  fetchProduct: FetchOffProduct = fetchOffProduct,
): Promise<FoodDetail | null> {
  const cached = findFoodByBarcode(db, ean, userId)
  if (cached) {
    if (cached.source === 'off' && Date.now() - cached.updatedAt > OFF_REFRESH_MS) {
      setImmediate(() => {
        refreshOffFood(db, ean, fetchProduct).catch(() => {})
      })
    }
    return toDetail(cached, userId)
  }
  const product = await fetchProduct(ean) // throws OffUnavailableError on outage
  if (!product) return null
  const food = mapOffProduct(ean, product)
  if (!food) return null
  upsertSourcedFood(db, food)
  const row = findFoodByBarcode(db, ean, userId)
  return row ? toDetail(row, userId) : null
}

async function refreshOffFood(db: DB, ean: string, fetchProduct: FetchOffProduct): Promise<void> {
  const product = await fetchProduct(ean)
  if (!product) return // keep the stale row; deletion would break diary references
  const food = mapOffProduct(ean, product)
  if (food) upsertSourcedFood(db, food)
}
