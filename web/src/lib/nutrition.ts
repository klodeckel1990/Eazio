import type { Nutrition } from '../api/types'

export function scaleNutrition(per: Nutrition, referenceAmount: number, grams: number): Nutrition {
  if (referenceAmount <= 0) return { kcal: 0, carb: 0, protein: 0, fat: 0 }
  const f = grams / referenceAmount
  return {
    kcal: round(per.kcal * f),
    carb: round(per.carb * f),
    protein: round(per.protein * f),
    fat: round(per.fat * f),
  }
}

export const round = (n: number): number => Math.round(n * 10) / 10

/** Getränk? → in ml statt g anzeigen. BLS lagert auch Getränke in Gramm; sie
 *  sind nur an der Hauptgruppe 'N' (alkoholfreie Getränke) erkennbar. OFF/eigene
 *  Getränke haben baseUnit='ml'. Spiegelt server/diary.repo.ts `isDrinkFood`. */
export function isDrink(food: { source?: string; category?: string | null; baseUnit?: string }): boolean {
  return food.baseUnit === 'ml' || (food.source === 'bls' && food.category === 'N')
}
