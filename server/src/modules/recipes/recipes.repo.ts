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
  ingredients: ExtractedIngredient[]
}

export interface RecipeSummary {
  id: string
  title: string
  servings: number | null
}

export interface RecipeDetail extends RecipeSummary {
  sourceUrl: string | null
  sourceType: string
  ingredients: ExtractedIngredient[]
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
  return { id, title: input.title, servings: input.servings }
}

export function listRecipes(db: DB, userId: string): RecipeSummary[] {
  return db
    .select({ id: recipes.id, title: recipes.title, servings: recipes.servings })
    .from(recipes)
    .where(eq(recipes.userId, userId))
    .orderBy(desc(recipes.createdAt))
    .all()
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
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType,
    ingredients: items.map((it) => ({
      raw: it.raw,
      quantity: it.quantity,
      unit: it.unit,
      name: it.name,
    })),
  }
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
