import type { DB } from '../../db/client.js'
import {
  findFoodByBarcode,
  getFoodById,
  searchFoods as searchRepo,
  upsertSourcedFood,
  type FoodRow,
  type ServingDef,
} from './foods.repo.js'
import { fetchOffProduct, searchOffProducts, type FetchOffProduct, type SearchOffProducts } from './off.client.js'
import { mapOffProduct } from './off.mapper.js'
import { parseIngredients } from '../parsing/parser.js'
import { resolveAmount, type NormalizedUnit } from '../parsing/units.js'
import { buildSearchQuery, isSeasoning, normalizeName } from '../matching/normalize.js'
import { getFoodAlias } from './food-aliases.repo.js'

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

// Below this many local hits, branded products from OFF are searched live.
const MIN_LOCAL_RESULTS = 3

/**
 * Text search across BLS/custom (local FTS) plus an Open Food Facts fallback
 * for branded products: only when the local index is sparse, results are
 * cached into the foods table (next search is local), OFF being down just
 * means no extra results.
 */
export async function searchSmart(
  db: DB,
  userId: string,
  query: string,
  limit: number,
  fetchSearch: SearchOffProducts = searchOffProducts,
): Promise<FoodSummary[]> {
  const local = search(db, userId, query, limit)
  if (local.length >= MIN_LOCAL_RESULTS) return local

  const products = await fetchSearch(query)
  const seen = new Set(local.map((f) => f.id))
  const merged = [...local]
  for (const p of products) {
    const id = `off:${p.code}`
    if (seen.has(id) || merged.length >= limit) continue
    seen.add(id)
    const existing = getFoodById(db, id, userId)
    if (existing && Date.now() - existing.updatedAt < OFF_REFRESH_MS) {
      merged.push(toSummary(existing, userId))
      continue
    }
    const food = mapOffProduct(p.code, p)
    if (!food) continue
    upsertSourcedFood(db, food)
    const row = getFoodById(db, id, userId)
    if (row) merged.push(toSummary(row, userId))
  }
  return merged
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

export interface FoodMatchLine {
  raw: string
  name: string
  qty: number | null
  unit: NormalizedUnit
  /** Grams parsed from the text (null when the unit was a serving/count). */
  amountGrams: number | null
  /** What the UI should preselect: parsed grams, learned default, first serving, else 100. */
  suggestedAmountG: number
  candidates: FoodSummary[]
  selectedFoodId: string | null
}

/**
 * Bulk text matching for the tracker: parse pasted ingredients, drop pure
 * seasonings, look up each line in the user's learned aliases and the foods
 * FTS index, with the OFF text fallback for branded products. Mirrors the
 * legacy Yazio matchText flow, but against our data.
 */
export async function matchFoodText(
  db: DB,
  userId: string,
  text: string,
  fetchSearch: SearchOffProducts = searchOffProducts,
): Promise<FoodMatchLine[]> {
  const out: FoodMatchLine[] = []
  for (const line of parseIngredients(text)) {
    if (isSeasoning(line.name)) continue
    const { normalizedUnit, amountGrams } = resolveAmount(line.qty, line.unit)
    const candidates = await searchSmart(db, userId, buildSearchQuery(line.name), 10, fetchSearch)

    let selectedFoodId = candidates[0]?.id ?? null
    let aliasDefaultG: number | null = null
    const alias = getFoodAlias(db, userId, normalizeName(line.name))
    if (alias) {
      const idx = candidates.findIndex((c) => c.id === alias.foodId)
      if (idx >= 0) {
        const [pick] = candidates.splice(idx, 1)
        candidates.unshift(pick!)
        selectedFoodId = pick!.id
        aliasDefaultG = alias.defaultAmountG
      }
    }

    // count units ("2 Stück") scale the per-piece default when one is known
    const qtyFactor = normalizedUnit === 'serving' && line.qty ? line.qty : 1
    const perPiece = aliasDefaultG ?? candidates[0]?.servings[0]?.grams ?? null
    const suggestedAmountG =
      amountGrams ?? (perPiece !== null ? Math.round(perPiece * qtyFactor) : 100)

    out.push({
      raw: line.raw,
      name: line.name,
      qty: line.qty,
      unit: normalizedUnit,
      amountGrams,
      suggestedAmountG,
      candidates,
      selectedFoodId,
    })
  }
  return out
}

async function refreshOffFood(db: DB, ean: string, fetchProduct: FetchOffProduct): Promise<void> {
  const product = await fetchProduct(ean)
  if (!product) return // keep the stale row; deletion would break diary references
  const food = mapOffProduct(ean, product)
  if (food) upsertSourcedFood(db, food)
}
