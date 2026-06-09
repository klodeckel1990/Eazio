import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { foodAliases } from '../../db/schema.js'

export interface FoodAlias {
  foodId: string
  defaultAmountG: number | null
  defaultServingLabel: string | null
}

export function getFoodAlias(db: DB, userId: string, normalizedName: string): FoodAlias | null {
  const row = db
    .select()
    .from(foodAliases)
    .where(and(eq(foodAliases.userId, userId), eq(foodAliases.normalizedName, normalizedName)))
    .get()
  return row
    ? { foodId: row.foodId, defaultAmountG: row.defaultAmountG, defaultServingLabel: row.defaultServingLabel }
    : null
}

export function upsertFoodAlias(
  db: DB,
  userId: string,
  normalizedName: string,
  alias: FoodAlias,
): void {
  db.insert(foodAliases)
    .values({
      id: randomUUID(),
      userId,
      normalizedName,
      foodId: alias.foodId,
      defaultAmountG: alias.defaultAmountG,
      defaultServingLabel: alias.defaultServingLabel,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [foodAliases.userId, foodAliases.normalizedName],
      set: {
        foodId: alias.foodId,
        defaultAmountG: alias.defaultAmountG,
        defaultServingLabel: alias.defaultServingLabel,
        hits: sql`${foodAliases.hits} + 1`,
        updatedAt: Date.now(),
      },
    })
    .run()
}
