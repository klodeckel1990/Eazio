import type { RecipeIngredient } from '../api/types'

const parseNum = (s: string): number => parseFloat(s.replace(',', '.'))

/** Round to 2 decimals and drop trailing zeros. */
function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Scales a string quantity by `factor`, preserving shapes the LLM keeps as text:
 * plain numbers ("100" → "50"), ranges ("2-3" → "1-1.5"), fractions ("1/2" → "0.25").
 * Non-numeric amounts ("eine Prise") are left unchanged.
 */
export function scaleQuantity(quantity: string, factor: number): string {
  const s = quantity.trim()
  if (!s || factor === 1) return s

  const range = s.match(/^(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)$/)
  if (range) return `${fmt(parseNum(range[1]!) * factor)}-${fmt(parseNum(range[2]!) * factor)}`

  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac) return fmt((Number(frac[1]) / Number(frac[2])) * factor)

  const num = s.match(/^\d+(?:[.,]\d+)?$/)
  if (num) return fmt(parseNum(s) * factor)

  return s
}

/** Builds the Tracker textarea content from recipe ingredients scaled by `factor`. */
export function buildTrackerText(ingredients: RecipeIngredient[], factor: number): string {
  return ingredients
    .map((ing) => [scaleQuantity(ing.quantity, factor), ing.unit, ing.name].filter((p) => p && p.trim()).join(' '))
    .filter((line) => line.trim().length > 0)
    .join('\n')
}
