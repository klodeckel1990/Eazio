import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { recipes, recipeIngredients } from '../../db/schema.js'
import type { ExtractedIngredient } from './types.js'

export interface CreateRecipeInput {
  title: string
  servings: number | null
  sourceUrl: string | null
  sourceType: string
  difficulty: string | null
  totalMinutes: number | null
  ingredients: ExtractedIngredient[]
  steps: string[]
}

export interface RecipeSummary {
  id: string
  title: string
  servings: number | null
  difficulty: string | null
  totalMinutes: number | null
  isFavorite: boolean
  hasImage: boolean
}

export interface RecipeDetail extends RecipeSummary {
  sourceUrl: string | null
  sourceType: string
  ingredients: ExtractedIngredient[]
  steps: string[]
}

export function createRecipe(db: DB, userId: string, input: CreateRecipeInput): RecipeSummary {
  const id = randomUUID()
  db.transaction((tx) => {
    tx.insert(recipes)
      .values({
        id,
        userId,
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceType: input.sourceType,
        servings: input.servings,
        difficulty: input.difficulty,
        totalMinutes: input.totalMinutes,
        steps: JSON.stringify(input.steps),
        createdAt: Date.now(),
      })
      .run()
    input.ingredients.forEach((ing, i) => {
      tx.insert(recipeIngredients)
        .values({
          id: randomUUID(),
          recipeId: id,
          position: i,
          raw: ing.raw,
          quantity: ing.quantity,
          unit: ing.unit,
          name: ing.name,
        })
        .run()
    })
  })
  return {
    id,
    title: input.title,
    servings: input.servings,
    difficulty: input.difficulty,
    totalMinutes: input.totalMinutes,
    isFavorite: false,
    hasImage: false,
  }
}

export function listRecipes(db: DB, userId: string): RecipeSummary[] {
  const rows = db
    .select({
      id: recipes.id,
      title: recipes.title,
      servings: recipes.servings,
      difficulty: recipes.difficulty,
      totalMinutes: recipes.totalMinutes,
      isFavorite: recipes.isFavorite,
      imageMime: recipes.imageMime,
    })
    .from(recipes)
    .where(eq(recipes.userId, userId))
    .orderBy(desc(recipes.isFavorite), desc(recipes.createdAt))
    .all()
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    difficulty: r.difficulty,
    totalMinutes: r.totalMinutes,
    isFavorite: r.isFavorite,
    hasImage: r.imageMime != null,
  }))
}

export function getRecipe(db: DB, userId: string, id: string): RecipeDetail | null {
  const row = db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .get()
  if (!row) return null
  const items = db
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(recipeIngredients.position))
    .all()
  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    difficulty: row.difficulty,
    totalMinutes: row.totalMinutes,
    isFavorite: row.isFavorite,
    hasImage: row.imageMime != null,
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType,
    steps: parseSteps(row.steps),
    ingredients: items.map((it) => ({
      raw: it.raw,
      quantity: it.quantity,
      unit: it.unit,
      name: it.name,
    })),
  }
}

function parseSteps(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

export interface PublicRecipe {
  title: string
  servings: number | null
  steps: string[]
  hasImage: boolean
  ingredients: ExtractedIngredient[]
}

/** Unscoped lookup for the token-gated public recipe page (no userId — the
 *  share token gates access). Returns only what the JSON-LD page needs. */
export function getPublicRecipe(db: DB, id: string): PublicRecipe | null {
  const row = db.select().from(recipes).where(eq(recipes.id, id)).get()
  if (!row) return null
  const items = db
    .select()
    .from(recipeIngredients)
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(recipeIngredients.position))
    .all()
  return {
    title: row.title,
    servings: row.servings,
    steps: parseSteps(row.steps),
    hasImage: row.imageMime != null,
    ingredients: items.map((it) => ({ raw: it.raw, quantity: it.quantity, unit: it.unit, name: it.name })),
  }
}

/** Unscoped image-mime lookup for the token-gated public image route. */
export function getRecipeImageMimeById(db: DB, id: string): string | null {
  const row = db.select({ imageMime: recipes.imageMime }).from(recipes).where(eq(recipes.id, id)).get()
  return row?.imageMime ?? null
}

export function removeRecipe(db: DB, userId: string, id: string): boolean {
  const row = db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .get()
  if (!row) return false
  // recipe_ingredients cascade via FK (foreign_keys pragma is ON in createDb).
  db.delete(recipes).where(eq(recipes.id, id)).run()
  return true
}

export function updateRecipeImageMime(db: DB, recipeId: string, mime: string): void {
  db.update(recipes).set({ imageMime: mime }).where(eq(recipes.id, recipeId)).run()
}

export function setFavorite(db: DB, userId: string, id: string, isFavorite: boolean): boolean {
  const row = db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .get()
  if (!row) return false
  db.update(recipes).set({ isFavorite }).where(eq(recipes.id, id)).run()
  return true
}

export function getRecipeImageMime(db: DB, userId: string, id: string): string | null {
  const row = db
    .select({ imageMime: recipes.imageMime })
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .get()
  return row?.imageMime ?? null
}
