import { normalizeName, isSeasoning, isPrepNote, isQualifierOnly } from '../matching/normalize.js'

export interface RecipeMatch {
  recipeId: string
  title: string
  hasImage: boolean
  total: number // Anzahl wesentlicher Zutaten
  have: number // davon im Vorrat
  missing: string[] // fehlende wesentliche Zutaten (Anzeigename)
}

const WATER = /\b(wasser|water|eiswurfel|eiswuerfel|ice)\b/

/** Wesentliche Zutat? Salz/Wasser/Gewürze/Prep-Notes/Füllwörter zählen nicht. */
function isEssential(name: string): boolean {
  if (!name.trim()) return false
  if (isQualifierOnly(name) || isPrepNote(name) || isSeasoning(name)) return false
  if (WATER.test(normalizeName(name))) return false
  return true
}

const coreTokens = (norm: string): string[] => norm.split(' ').filter((t) => t.length >= 4)

interface PantryName {
  norm: string
  tokens: Set<string>
}

/** Deckt der Vorrat diese Zutat ab? Substring beidseitig oder Token-Überlappung. */
function covered(ingredientName: string, pantry: PantryName[]): boolean {
  const ing = normalizeName(ingredientName)
  if (!ing) return false
  const ingTokens = coreTokens(ing)
  for (const f of pantry) {
    if (f.norm === ing || f.norm.includes(ing) || ing.includes(f.norm)) return true
    for (const t of ingTokens) if (f.tokens.has(t)) return true
  }
  return false
}

/** Rezepte gegen Vorrats-Lebensmittel (name-basiert) matchen, nach Deckung sortiert. */
export function matchRecipes(
  recipes: { id: string; title: string; hasImage: boolean; ingredients: string[] }[],
  pantryFoodNames: string[],
): RecipeMatch[] {
  const pantry: PantryName[] = pantryFoodNames.map((n) => {
    const norm = normalizeName(n)
    return { norm, tokens: new Set(coreTokens(norm)) }
  })

  const matches: RecipeMatch[] = []
  for (const r of recipes) {
    const essentials = r.ingredients.filter(isEssential)
    if (essentials.length === 0) continue
    let have = 0
    const missing: string[] = []
    for (const ing of essentials) {
      if (pantry.length > 0 && covered(ing, pantry)) have++
      else missing.push(ing)
    }
    matches.push({ recipeId: r.id, title: r.title, hasImage: r.hasImage, total: essentials.length, have, missing })
  }

  matches.sort(
    (a, b) =>
      b.have / b.total - a.have / a.total || // höchste Deckung zuerst
      b.have - a.have ||
      a.missing.length - b.missing.length,
  )
  return matches
}
