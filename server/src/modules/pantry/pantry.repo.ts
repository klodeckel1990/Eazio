import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { pantryItems, foods } from '../../db/schema.js'

export interface PantryRow {
  id: string
  foodId: string
  amountG: number
  expiresAt: number | null
  addedAt: number
  // denormalisierte Food-Infos (für Anzeige + Matching/Wizard)
  name: string
  brand: string | null
  baseUnit: string
  category: string | null
  source: string
  kcal: number
  protein: number | null
  fat: number | null
  carbs: number | null
}

export function listPantry(db: DB, userId: string): PantryRow[] {
  return db
    .select({
      id: pantryItems.id,
      foodId: pantryItems.foodId,
      amountG: pantryItems.amountG,
      expiresAt: pantryItems.expiresAt,
      addedAt: pantryItems.addedAt,
      name: foods.name,
      brand: foods.brand,
      baseUnit: foods.baseUnit,
      category: foods.category,
      source: foods.source,
      kcal: foods.kcal,
      protein: foods.protein,
      fat: foods.fat,
      carbs: foods.carbs,
    })
    .from(pantryItems)
    .innerJoin(foods, eq(foods.id, pantryItems.foodId))
    .where(eq(pantryItems.userId, userId))
    .orderBy(asc(foods.name))
    .all()
}

/** Food in den Vorrat legen — existiert es schon, wird die Menge addiert; ein
 *  neu angegebenes MHD überschreibt, ein fehlendes (null) lässt es unberührt. */
export function addOrIncrementPantry(
  db: DB,
  userId: string,
  foodId: string,
  amountG: number,
  expiresAt: number | null = null,
): void {
  const now = Date.now()
  db.insert(pantryItems)
    .values({ id: randomUUID(), userId, foodId, amountG, expiresAt, addedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [pantryItems.userId, pantryItems.foodId],
      set: {
        amountG: sql`${pantryItems.amountG} + ${amountG}`,
        expiresAt: sql`COALESCE(excluded.expires_at, ${pantryItems.expiresAt})`,
        updatedAt: now,
      },
    })
    .run()
}

export function updatePantryItem(
  db: DB,
  userId: string,
  id: string,
  patch: { amountG?: number; expiresAt?: number | null },
): boolean {
  const set: Partial<typeof pantryItems.$inferInsert> = { updatedAt: Date.now() }
  if (patch.amountG !== undefined) set.amountG = patch.amountG
  if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt
  const res = db
    .update(pantryItems)
    .set(set)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)))
    .run()
  return res.changes > 0
}

export function removePantryItem(db: DB, userId: string, id: string): boolean {
  const res = db
    .delete(pantryItems)
    .where(and(eq(pantryItems.id, id), eq(pantryItems.userId, userId)))
    .run()
  return res.changes > 0
}
