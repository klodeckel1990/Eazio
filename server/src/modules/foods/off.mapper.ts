import type { NewFood } from './foods.repo.js'
import type { OffProduct } from './off.client.js'
import { buildSearchTerms } from './search-terms.js'

function num(v: number | string | undefined): number | null {
  if (v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Maps an OFF product to our foods row (per 100 g/ml). Returns null when no
 * energy value is derivable — such entries are useless for tracking and the
 * client should offer manual entry instead.
 */
export function mapOffProduct(ean: string, p: OffProduct): NewFood | null {
  const n = p.nutriments ?? {}
  const kcal = num(n['energy-kcal_100g']) ?? kcalFromKj(num(n['energy_100g']))
  if (kcal === null) return null

  const name = (p.product_name_de || p.product_name || '').trim()
  if (!name) return null
  const rawBrand = Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0]
  const brand = rawBrand?.trim() || null

  // OFF sodium is g/100g; our column stores mg to match BLS.
  const sodiumG = num(n['sodium_100g'])

  const servingGrams = num(p.serving_quantity)
  const servings =
    servingGrams && servingGrams > 0
      ? [{ label: p.serving_size?.trim() || 'Portion', grams: servingGrams }]
      : null

  // Liquids: OFF marks them only loosely; treat "quantity" ending in l/ml as ml.
  const baseUnit = /\d\s*m?l\b/i.test(p.quantity ?? '') ? 'ml' : 'g'

  const now = Date.now()
  return {
    id: `off:${ean}`,
    source: 'off',
    sourceId: ean,
    barcode: ean,
    name,
    brand,
    category: p.categories_tags?.[p.categories_tags.length - 1] ?? null,
    searchTerms: buildSearchTerms(name, brand),
    baseUnit,
    kcal,
    protein: num(n['proteins_100g']),
    fat: num(n['fat_100g']),
    saturatedFat: num(n['saturated-fat_100g']),
    carbs: num(n['carbohydrates_100g']),
    sugar: num(n['sugars_100g']),
    fiber: num(n['fiber_100g']),
    salt: num(n['salt_100g']),
    sodium: sodiumG === null ? null : Math.round(sodiumG * 1000),
    // alcohol_100g is % vol in OFF, not grams — kept out of the gram column.
    nutrientsJson: JSON.stringify({ off: { alcoholVol: num(n['alcohol_100g']) } }),
    servingsJson: servings ? JSON.stringify(servings) : null,
    createdAt: now,
    updatedAt: now,
  }
}

function kcalFromKj(kj: number | null): number | null {
  return kj === null ? null : Math.round((kj / 4.184) * 10) / 10
}
