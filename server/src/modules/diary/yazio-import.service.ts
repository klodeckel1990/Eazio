// One-off history import: pulls past consumed items from a linked Yazio
// account into diary_entries (origin 'yazio_import'). Idempotent per day — a
// day that already holds imported entries is skipped, so re-running after an
// abort continues where it stopped. Imported entries carry mirrorStatus
// 'mirrored' (they exist in Yazio), so deleting one later also removes it there.

import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { diaryEntries } from '../../db/schema.js'
import { getAccount, getDefaultAccount, type AccountRecord } from '../accounts/accounts.repo.js'
import { buildYazioClient } from '../yazio/client.js'
import { buildRecipeFetcher, type RecipeFetcher, type YazioRecipeDetails } from '../yazio/recipes.js'
import { dateInTz, type Daytime } from '../meals/daytime.js'
import { previousDay } from './streak.js'
import { insertEntries, type NewDiaryEntry } from './diary.repo.js'

interface ConsumedProduct {
  id: string
  product_id: string
  date: string
  daytime: Daytime
  /** grams; null for purely serving-based entries */
  amount: number | null
  serving: string | null
  serving_quantity: number | null
}

interface ConsumedRecipePortion {
  id: string
  date: string
  daytime: Daytime
  recipe_id: string
  /** portions eaten (0.5 = half a portion) */
  portion_count: number
}

interface ProductDetails {
  name: string
  producer: string | null
  // per 1 g/ml of the product
  nutrients: Record<string, number>
}

export interface HistoryClient {
  user: {
    // the yazio lib validates `date` as a real Date object (zod), not a string
    getConsumedItems: (opts: { date: Date }) => Promise<{
      products: ConsumedProduct[]
      recipe_portions: ConsumedRecipePortion[]
    }>
  }
  products: {
    // plain string id — an options object turns into /products/[object Object]
    get: (id: string) => Promise<ProductDetails>
  }
  /** recipes are not covered by the yazio package — raw v15 API fetcher */
  recipes: {
    get: RecipeFetcher
  }
}

export type HistoryClientFactory = (db: DB, account: AccountRecord) => HistoryClient

const defaultFactory: HistoryClientFactory = (db, account) => {
  const client = buildYazioClient(db, account) as unknown as Omit<HistoryClient, 'recipes'>
  return { ...client, user: client.user, products: client.products, recipes: { get: buildRecipeFetcher(db, account) } }
}

export interface ImportResult {
  daysScanned: number
  daysSkipped: number
  entriesImported: number
}

export class NoAccountError extends Error {
  constructor() {
    super('no yazio account')
    this.name = 'NoAccountError'
  }
}

const r1 = (x: number): number => Math.round(x * 10) / 10

function hasImportedEntries(db: DB, userId: string, date: string): boolean {
  const row = db
    .select({ one: sql<number>`1` })
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.userId, userId),
        eq(diaryEntries.date, date),
        eq(diaryEntries.origin, 'yazio_import'),
      ),
    )
    .limit(1)
    .get()
  return row !== undefined
}

export async function importYazioHistory(
  db: DB,
  userId: string,
  options: { accountId?: string; days: number },
  factory: HistoryClientFactory = defaultFactory,
): Promise<ImportResult> {
  const account = options.accountId
    ? getAccount(db, userId, options.accountId)
    : getDefaultAccount(db, userId)
  if (!account) throw new NoAccountError()
  const client = factory(db, account)

  const productCache = new Map<string, ProductDetails | null>()
  const getProduct = async (id: string): Promise<ProductDetails | null> => {
    if (!productCache.has(id)) {
      productCache.set(id, await client.products.get(id).catch(() => null))
    }
    return productCache.get(id)!
  }
  const recipeCache = new Map<string, YazioRecipeDetails | null>()
  const getRecipe = async (id: string): Promise<YazioRecipeDetails | null> => {
    if (!recipeCache.has(id)) {
      recipeCache.set(id, await client.recipes.get(id).catch(() => null))
    }
    return recipeCache.get(id)!
  }

  const result: ImportResult = { daysScanned: 0, daysSkipped: 0, entriesImported: 0 }
  let date = dateInTz(new Date(), env.TZ)
  for (let i = 0; i < options.days; i++, date = previousDay(date)) {
    result.daysScanned++
    if (hasImportedEntries(db, userId, date)) {
      result.daysSkipped++
      continue
    }
    // noon avoids any UTC/local off-by-one when the lib formats the date
    const { products, recipe_portions: recipePortions = [] } = await client.user.getConsumedItems({
      date: new Date(`${date}T12:00:00`),
    })
    if (products.length === 0 && recipePortions.length === 0) continue

    const rows: NewDiaryEntry[] = []
    for (const item of products) {
      if (item.amount === null || item.amount <= 0) continue // no gram amount — nutrients not computable
      const product = await getProduct(item.product_id)
      if (!product) continue // deleted/unreachable product — skip the line, not the day
      const n = product.nutrients
      const ts = Date.now()
      rows.push({
        id: randomUUID(),
        userId,
        date,
        daytime: item.daytime,
        foodId: null,
        nameSnapshot: product.producer ? `${product.name} (${product.producer})` : product.name,
        amountG: item.amount,
        servingLabel: item.serving,
        servingQuantity: item.serving_quantity,
        kcal: r1((n['energy.energy'] ?? 0) * item.amount),
        protein: r1((n['nutrient.protein'] ?? 0) * item.amount),
        fat: r1((n['nutrient.fat'] ?? 0) * item.amount),
        carbs: r1((n['nutrient.carb'] ?? 0) * item.amount),
        sugar: r1((n['nutrient.sugar'] ?? 0) * item.amount),
        fiber: r1((n['nutrient.dietaryfiber'] ?? 0) * item.amount),
        origin: 'yazio_import',
        originRefId: item.id,
        mirrorStatus: 'mirrored',
        mirrorJson: JSON.stringify({ accountId: account.id, consumedId: item.id, imported: true }),
        createdAt: ts,
        updatedAt: ts,
      })
    }
    for (const item of recipePortions) {
      if (!item.portion_count || item.portion_count <= 0) continue
      const recipe = await getRecipe(item.recipe_id)
      if (!recipe) continue // deleted/unreachable recipe — skip the line, not the day
      // recipe.nutrients are the TOTAL of the ingredient list; portion_count
      // says how many portions that total yields.
      const fraction = item.portion_count / (recipe.portion_count || 1)
      const n = recipe.nutrients
      const totalG = (recipe.servings ?? []).reduce((s, sv) => s + (sv.amount ?? 0), 0)
      const ts = Date.now()
      rows.push({
        id: randomUUID(),
        userId,
        date,
        daytime: item.daytime,
        foodId: null,
        nameSnapshot: recipe.name,
        amountG: totalG > 0 ? r1(totalG * fraction) : 1,
        servingLabel: 'Portion',
        servingQuantity: item.portion_count,
        kcal: r1((n['energy.energy'] ?? 0) * fraction),
        protein: r1((n['nutrient.protein'] ?? 0) * fraction),
        fat: r1((n['nutrient.fat'] ?? 0) * fraction),
        carbs: r1((n['nutrient.carb'] ?? 0) * fraction),
        sugar: r1((n['nutrient.sugar'] ?? 0) * fraction),
        fiber: r1((n['nutrient.dietaryfiber'] ?? 0) * fraction),
        origin: 'yazio_import',
        originRefId: item.id,
        mirrorStatus: 'mirrored',
        mirrorJson: JSON.stringify({ accountId: account.id, consumedId: item.id, imported: true, recipe: true }),
        createdAt: ts,
        updatedAt: ts,
      })
    }
    insertEntries(db, rows)
    result.entriesImported += rows.length
  }
  return result
}
