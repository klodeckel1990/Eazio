export type NormalizedUnit = 'g' | 'ml' | 'serving'

export interface ResolvedAmount {
  normalizedUnit: NormalizedUnit
  amountGrams: number | null
}

const GRAM_UNITS: Record<string, number> = { g: 1, gr: 1, gramm: 1, kg: 1000, lb: 453.6, oz: 28.35 }
const ML_UNITS: Record<string, number> = { ml: 1, l: 1000 }
// Spoon/hand measures → approximate grams. Rough defaults (1 EL ≈ 15 g,
// 1 TL ≈ 5 g, 1 Handvoll ≈ 30 g) that the user can fine-tune per line in the
// review UI — better than asking the AI for the weight of "one piece" of a
// loose ingredient like Rucola.
const SPOON_UNITS: Record<string, number> = { el: 15, tl: 5, handvoll: 30, cup: 240, stick: 113 }

export function resolveAmount(qty: number | null, unit: string | null): ResolvedAmount {
  const q = qty ?? 1
  if (unit && unit in GRAM_UNITS) return { normalizedUnit: 'g', amountGrams: q * GRAM_UNITS[unit]! }
  if (unit && unit in ML_UNITS) return { normalizedUnit: 'ml', amountGrams: q * ML_UNITS[unit]! }
  if (unit && unit in SPOON_UNITS) return { normalizedUnit: 'g', amountGrams: q * SPOON_UNITS[unit]! }
  return { normalizedUnit: 'serving', amountGrams: null }
}
