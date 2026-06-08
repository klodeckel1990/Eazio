export type NormalizedUnit = 'g' | 'ml' | 'serving'

export interface ResolvedAmount {
  normalizedUnit: NormalizedUnit
  amountGrams: number | null
}

const GRAM_UNITS: Record<string, number> = { g: 1, gr: 1, gramm: 1, kg: 1000 }
const ML_UNITS: Record<string, number> = { ml: 1, l: 1000 }

export function resolveAmount(qty: number | null, unit: string | null): ResolvedAmount {
  const q = qty ?? 1
  if (unit && unit in GRAM_UNITS) return { normalizedUnit: 'g', amountGrams: q * GRAM_UNITS[unit]! }
  if (unit && unit in ML_UNITS) return { normalizedUnit: 'ml', amountGrams: q * ML_UNITS[unit]! }
  return { normalizedUnit: 'serving', amountGrams: null }
}
