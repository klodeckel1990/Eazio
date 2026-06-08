import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { aliases } from '../../db/schema.js'

export type AliasRecord = typeof aliases.$inferSelect

export interface AliasInput {
  productId: string
  defaultServing?: string | null
  defaultServingQuantity?: number | null
  defaultAmountG?: number | null
}

export function getAlias(db: DB, userId: string, normalizedName: string): AliasRecord | undefined {
  return db
    .select()
    .from(aliases)
    .where(and(eq(aliases.userId, userId), eq(aliases.normalizedName, normalizedName)))
    .get()
}

export function upsertAlias(
  db: DB,
  userId: string,
  normalizedName: string,
  input: AliasInput,
): void {
  const existing = getAlias(db, userId, normalizedName)
  const fields = {
    productId: input.productId,
    defaultServing: input.defaultServing ?? null,
    defaultServingQuantity: input.defaultServingQuantity ?? null,
    defaultAmountG: input.defaultAmountG ?? null,
    updatedAt: Date.now(),
  }
  if (existing) {
    db.update(aliases)
      .set({ ...fields, hits: existing.hits + 1 })
      .where(eq(aliases.id, existing.id))
      .run()
  } else {
    db.insert(aliases)
      .values({ id: randomUUID(), userId, normalizedName, hits: 1, ...fields })
      .run()
  }
}
