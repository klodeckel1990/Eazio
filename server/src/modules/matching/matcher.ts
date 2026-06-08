import type { DB } from '../../db/client.js'
import { env } from '../../config/env.js'
import { parseIngredients } from '../parsing/parser.js'
import { resolveAmount, type NormalizedUnit } from '../parsing/units.js'
import { normalizeName } from './normalize.js'
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

function toCandidate(r: SearchResult): ProductCandidate {
  const n = r.nutrients
  return {
    productId: r.product_id,
    name: r.name,
    producer: r.producer,
    isVerified: r.is_verified,
    baseUnit: r.base_unit,
    referenceAmount: r.amount,
    serving: r.serving,
    servingQuantity: r.serving_quantity,
    nutrientsPerReference: {
      kcal: n['energy.energy'] ?? 0,
      carb: n['nutrient.carb'] ?? 0,
      protein: n['nutrient.protein'] ?? 0,
      fat: n['nutrient.fat'] ?? 0,
    },
  }
}

const split = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean)

export async function matchText(
  client: SearchClient,
  db: DB,
  userId: string,
  text: string,
): Promise<MatchedLine[]> {
  const countries = split(env.YAZIO_COUNTRIES)
  const locales = split(env.YAZIO_LOCALES)
  const out: MatchedLine[] = []

  for (const line of parseIngredients(text)) {
    const { normalizedUnit, amountGrams } = resolveAmount(line.qty, line.unit)
    const results = await client.products.search({ query: line.name, countries, locales })
    let candidates = results.slice(0, 10).map(toCandidate)

    let selectedProductId = candidates[0]?.productId ?? null
    const alias = getAlias(db, userId, normalizeName(line.name))
    if (alias) {
      const idx = candidates.findIndex((c) => c.productId === alias.productId)
      if (idx >= 0) {
        const [pick] = candidates.splice(idx, 1)
        candidates = [pick!, ...candidates]
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
