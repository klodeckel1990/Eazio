import type { DB } from '../../db/client.js'
import { env } from '../../config/env.js'
import { parseIngredients } from '../parsing/parser.js'
import { resolveAmount, type NormalizedUnit } from '../parsing/units.js'
import { normalizeName, buildSearchQuery, isSeasoning } from './normalize.js'
import { getAlias } from '../learning/aliases.repo.js'

export interface SearchResult {
  product_id: string
  name: string
  producer: string
  is_verified: boolean
  base_unit: string
  amount: number
  serving: string
  serving_quantity: number
  nutrients: Record<string, number>
}

export interface SearchClient {
  products: {
    search: (opts: { query: string; countries?: string[]; locales?: string[] }) => Promise<SearchResult[]>
  }
}

export interface ProductCandidate {
  productId: string
  name: string
  producer: string
  isVerified: boolean
  baseUnit: string
  referenceAmount: number
  serving: string
  servingQuantity: number
  nutrientsPerReference: { kcal: number; carb: number; protein: number; fat: number }
}

export interface MatchedLine {
  raw: string
  name: string
  qty: number | null
  unit: NormalizedUnit
  amountGrams: number | null
  candidates: ProductCandidate[]
  selectedProductId: string | null
}

/** Rounds to 2 decimals to drop float noise from the per-unit × amount scaling. */
const round2 = (x: number): number => Math.round(x * 100) / 100

function toCandidate(r: SearchResult): ProductCandidate {
  const n = r.nutrients
  // Yazio search returns nutrient values per 1 base unit (g/ml). Scale them by the
  // reference amount so nutrientsPerReference is genuinely "per referenceAmount" —
  // the frontend then scales referenceAmount → the user's entered grams.
  const amount = r.amount
  return {
    productId: r.product_id,
    name: r.name,
    producer: r.producer,
    isVerified: r.is_verified,
    baseUnit: r.base_unit,
    referenceAmount: amount,
    serving: r.serving,
    servingQuantity: r.serving_quantity,
    nutrientsPerReference: {
      kcal: round2((n['energy.energy'] ?? 0) * amount),
      carb: round2((n['nutrient.carb'] ?? 0) * amount),
      protein: round2((n['nutrient.protein'] ?? 0) * amount),
      fat: round2((n['nutrient.fat'] ?? 0) * amount),
    },
  }
}

const split = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean)

/** Searches Yazio for a single query and maps the top-10 results to candidates. */
export async function searchCandidates(client: SearchClient, query: string): Promise<ProductCandidate[]> {
  const countries = split(env.YAZIO_COUNTRIES)
  const locales = split(env.YAZIO_LOCALES)
  const results = await client.products.search({ query, countries, locales })
  return results.slice(0, 10).map(toCandidate)
}

export async function matchText(
  client: SearchClient,
  db: DB,
  userId: string,
  text: string,
): Promise<MatchedLine[]> {
  const out: MatchedLine[] = []

  for (const line of parseIngredients(text)) {
    const { normalizedUnit, amountGrams } = resolveAmount(line.qty, line.unit)
    let candidates = await searchCandidates(client, buildSearchQuery(line.name))

    // Drop pure seasonings (curated list) and zero-calorie products — they clutter
    // the list and add ~no calories. Ambiguous foods (Paprika, Ingwer, …) are kept.
    if (isSeasoning(line.name) || candidates[0]?.nutrientsPerReference.kcal === 0) continue

    let selectedProductId = candidates[0]?.productId ?? null
    const alias = getAlias(db, userId, normalizeName(line.name))
    if (alias) {
      const idx = candidates.findIndex((c) => c.productId === alias.productId)
      if (idx >= 0) {
        const [pick] = candidates.splice(idx, 1)
        candidates.unshift(pick!)
        selectedProductId = pick!.productId
      }
    }

    out.push({
      raw: line.raw,
      name: line.name,
      qty: line.qty,
      unit: normalizedUnit,
      amountGrams,
      candidates,
      selectedProductId,
    })
  }
  return out
}
