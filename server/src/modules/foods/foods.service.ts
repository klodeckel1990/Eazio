import type { DB } from '../../db/client.js'
import {
  findFoodByBarcode,
  getCachedMatch,
  getFoodById,
  searchFoods as searchRepo,
  upsertCachedMatch,
  upsertSourcedFood,
  type FoodRow,
  type ServingDef,
} from './foods.repo.js'
import { aiRerank, type AiRerank } from './ai-match.js'
import { fetchOffProduct, searchOffProducts, type FetchOffProduct, type SearchOffProducts } from './off.client.js'
import { mapOffProduct } from './off.mapper.js'
import { parseIngredients } from '../parsing/parser.js'
import { resolveAmount, type NormalizedUnit } from '../parsing/units.js'
import { buildSearchQuery, isSeasoning, normalizeName } from '../matching/normalize.js'
import { getFoodAlias } from './food-aliases.repo.js'
import { compoundHeadFallback, foldGerman } from './search-terms.js'

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
 * seasonings, look up each line in the user's learned aliases, the global LLM
 * match cache and the foods FTS index (with OFF text fallback). Lines that
 * none of the caches resolve go through one batched AI rerank — Claude picks
 * the nutritionally fitting candidate; on any LLM problem the FTS order
 * stands. Confirmed AI picks are cached globally (shared foods only).
 */
export async function matchFoodText(
  db: DB,
  userId: string,
  text: string,
  fetchSearch: SearchOffProducts = searchOffProducts,
  rerank: AiRerank = aiRerank,
): Promise<FoodMatchLine[]> {
  interface Pending {
    line: ReturnType<typeof parseIngredients>[number]
    normalizedUnit: NormalizedUnit
    amountGrams: number | null
    candidates: FoodSummary[]
    selectedFoodId: string | null
    aliasDefaultG: number | null
    normalizedName: string
    needsAi: boolean
  }

  const pending: Pending[] = []
  for (const line of parseIngredients(text)) {
    if (isSeasoning(line.name)) continue
    const { normalizedUnit, amountGrams } = resolveAmount(line.qty, line.unit)
    const query = buildSearchQuery(line.name)
    let candidates = await searchSmart(db, userId, query, 12, fetchSearch)
    if (candidates.length === 0) {
      // unknown compound ("Romatomaten") — search its head ("tomate") and let
      // the AI rerank pick the fitting base product
      const head = compoundHeadFallback(line.name)
      if (head) candidates = await searchSmart(db, userId, head, 12, fetchSearch)
    }
    if (candidates.length === 0) {
      // multi-word zero hit ("Cherry-Tomaten"): try the tokens individually
      for (const token of query.split(/\s+/).slice(0, 3)) {
        if (token.length < 3) continue
        candidates = await searchSmart(db, userId, token, 12, fetchSearch)
        if (candidates.length > 0) break
      }
    }
    const normalizedName = normalizeName(line.name)

    let selectedFoodId = candidates[0]?.id ?? null
    let aliasDefaultG: number | null = null
    let resolved = false

    // moves a known-good food to the front — fetched by id when the FTS
    // candidate set does not contain it (typical for AI-requeried matches)
    const promote = (foodId: string): boolean => {
      const idx = candidates.findIndex((c) => c.id === foodId)
      if (idx >= 0) {
        const [pick] = candidates.splice(idx, 1)
        candidates.unshift(pick!)
      } else {
        const row = getFoodById(db, foodId, userId)
        if (!row) return false
        candidates.unshift(toSummary(row, userId))
      }
      selectedFoodId = foodId
      return true
    }

    // 1) the user's own learned mapping always wins
    const alias = getFoodAlias(db, userId, normalizedName)
    if (alias && promote(alias.foodId)) {
      aliasDefaultG = alias.defaultAmountG
      resolved = true
    }

    // 2) global LLM match memory (one AI call per unique name, ever)
    if (!resolved) {
      const cached = getCachedMatch(db, normalizedName)
      if (cached && promote(cached)) {
        resolved = true
      }
    }

    pending.push({
      line,
      normalizedUnit,
      amountGrams,
      candidates,
      selectedFoodId,
      aliasDefaultG,
      normalizedName,
      // a single candidate needs no ranking; zero candidates have no ranking
      needsAi: !resolved && candidates.length >= 2,
    })
  }

  const toRerankLine = (p: Pending) => ({
    name: p.line.name,
    candidates: p.candidates.map((c) => ({
      id: c.id,
      label: c.brand ? `${c.name} – ${c.brand}` : c.name,
    })),
  })
  const applyPick = (p: Pending, pickId: string) => {
    const idx = p.candidates.findIndex((c) => c.id === pickId)
    if (idx < 0) return
    if (idx > 0) {
      const [pick] = p.candidates.splice(idx, 1)
      p.candidates.unshift(pick!)
    }
    p.selectedFoodId = pickId
    // cache confirmations too — otherwise every repeat pays the AI call
    if (p.candidates[0]!.source !== 'custom') {
      upsertCachedMatch(db, p.normalizedName, pickId)
    }
  }

  // 3) one batched AI pass for everything the caches did not resolve; lines
  //    the model rejects come with a better database-style search term and
  //    get exactly one re-search + re-rank round ("Ei" → "Hühnerei")
  const aiLines = pending.filter((p) => p.needsAi)
  if (aiLines.length > 0) {
    const picks = await rerank(aiLines.map(toRerankLine))
    const retries: { p: Pending; query: string }[] = []
    aiLines.forEach((p, i) => {
      const pick = picks[i]
      if (!pick) return
      if (pick.id) applyPick(p, pick.id)
      else if (pick.retryQuery) retries.push({ p, query: pick.retryQuery })
    })

    if (retries.length > 0) {
      const originals = new Map<Pending, FoodSummary[]>()
      for (const { p, query } of retries) {
        const extra = await searchSmart(db, userId, query, 12, fetchSearch)
        if (extra.length > 0) {
          originals.set(p, p.candidates)
          const seen = new Set(extra.map((c) => c.id))
          p.candidates = [...extra, ...p.candidates.filter((c) => !seen.has(c.id))].slice(0, 12)
        }
      }
      const secondPicks = await rerank(retries.map(({ p }) => toRerankLine(p)))
      retries.forEach(({ p }, i) => {
        const pick = secondPicks[i]
        if (pick?.id) {
          applyPick(p, pick.id)
        } else {
          // the requery did not convince the model either — keep the original
          // FTS list instead of leaving requeried noise on top
          const original = originals.get(p)
          if (original) {
            p.candidates = original
            p.selectedFoodId = original[0]?.id ?? null
          }
        }
      })
    }
  }

  const out: FoodMatchLine[] = []
  for (const p of pending) {
    const { line, normalizedUnit, amountGrams, candidates, selectedFoodId, aliasDefaultG } = p
    // count units ("2 Stück", "3 Scheiben") scale the per-piece default; the
    // unit word picks the matching serving ("Scheibe" 50 g over "Stück").
    const qtyFactor = normalizedUnit === 'serving' && line.qty ? line.qty : 1
    const perPiece =
      aliasDefaultG ?? pickServingGrams(candidates[0]?.servings ?? [], line.unit)
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

/** Serving whose label matches the typed unit word ("scheiben" → "Scheibe"),
 *  else the first serving; null when the food has none. */
function pickServingGrams(servings: ServingDef[], unitWord: string | null): number | null {
  if (servings.length === 0) return null
  if (unitWord) {
    const u = foldGerman(unitWord)
    const hit = servings.find((s) => {
      const l = foldGerman(s.label)
      return l.startsWith(u) || u.startsWith(l)
    })
    if (hit) return hit.grams
  }
  return servings[0]?.grams ?? null
}

async function refreshOffFood(db: DB, ean: string, fetchProduct: FetchOffProduct): Promise<void> {
  const product = await fetchProduct(ean)
  if (!product) return // keep the stale row; deletion would break diary references
  const food = mapOffProduct(ean, product)
  if (food) upsertSourcedFood(db, food)
}
