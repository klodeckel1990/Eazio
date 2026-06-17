import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { presets, presetItems, foods } from '../../db/schema.js'

export interface PresetItemInput {
  rawText: string
  productId: string
  serving?: string | null
  servingQuantity?: number | null
  amountG: number
}

export interface PresetSummary {
  id: string
  name: string
}

export interface PresetItem {
  position: number
  rawText: string
  productId: string
  serving: string | null
  servingQuantity: number | null
  amountG: number
  /** Anzeige-Einheit: 'ml' bei Getränken (BLS-Gruppe N / baseUnit ml), sonst 'g'. */
  unit: 'g' | 'ml'
}

export interface PresetWithItems extends PresetSummary {
  items: PresetItem[]
}

export function createPreset(
  db: DB,
  userId: string,
  name: string,
  items: PresetItemInput[],
): PresetSummary {
  const id = randomUUID()
  db.transaction((tx) => {
    tx.insert(presets).values({ id, userId, name, createdAt: Date.now() }).run()
    items.forEach((it, i) => {
      tx.insert(presetItems)
        .values({
          id: randomUUID(),
          presetId: id,
          position: i,
          rawText: it.rawText,
          productId: it.productId,
          serving: it.serving ?? null,
          servingQuantity: it.servingQuantity ?? null,
          amountG: it.amountG,
        })
        .run()
    })
  })
  return { id, name }
}

export function listPresets(db: DB, userId: string): PresetSummary[] {
  return db
    .select({ id: presets.id, name: presets.name })
    .from(presets)
    .where(eq(presets.userId, userId))
    .orderBy(asc(presets.name))
    .all()
}

export function getPreset(db: DB, userId: string, id: string): PresetWithItems | undefined {
  const preset = db
    .select({ id: presets.id, name: presets.name })
    .from(presets)
    .where(and(eq(presets.id, id), eq(presets.userId, userId)))
    .get()
  if (!preset) return undefined
  const items = db
    .select({
      position: presetItems.position,
      rawText: presetItems.rawText,
      productId: presetItems.productId,
      serving: presetItems.serving,
      servingQuantity: presetItems.servingQuantity,
      amountG: presetItems.amountG,
      // ml bei Getränken (gespiegelt zu diary.repo isDrinkFood); Legacy-Items
      // ohne passendes foods-Match fallen via LEFT JOIN auf 'g' zurück.
      unit: sql<'g' | 'ml'>`CASE WHEN ${foods.baseUnit} = 'ml' OR (${foods.source} = 'bls' AND ${foods.category} = 'N') THEN 'ml' ELSE 'g' END`,
    })
    .from(presetItems)
    .leftJoin(foods, eq(foods.id, presetItems.productId))
    .where(eq(presetItems.presetId, id))
    .orderBy(asc(presetItems.position))
    .all()
  return { ...preset, items }
}

/** Name und/oder Items aktualisieren. Items werden komplett ersetzt (positions-
 *  treu neu angelegt). Ownership-Check in derselben Transaktion. */
export function updatePreset(
  db: DB,
  userId: string,
  id: string,
  patch: { name?: string; items?: PresetItemInput[] },
): PresetWithItems | undefined {
  const ok = db.transaction((tx) => {
    const owned = tx
      .select({ id: presets.id })
      .from(presets)
      .where(and(eq(presets.id, id), eq(presets.userId, userId)))
      .get()
    if (!owned) return false
    if (patch.name !== undefined) {
      tx.update(presets).set({ name: patch.name }).where(eq(presets.id, id)).run()
    }
    if (patch.items !== undefined) {
      tx.delete(presetItems).where(eq(presetItems.presetId, id)).run()
      patch.items.forEach((it, i) => {
        tx.insert(presetItems)
          .values({
            id: randomUUID(),
            presetId: id,
            position: i,
            rawText: it.rawText,
            productId: it.productId,
            serving: it.serving ?? null,
            servingQuantity: it.servingQuantity ?? null,
            amountG: it.amountG,
          })
          .run()
      })
    }
    return true
  })
  if (!ok) return undefined
  return getPreset(db, userId, id)
}

export function deletePreset(db: DB, userId: string, id: string): boolean {
  // Ownership check + deletes in one transaction (no TOCTOU window).
  return db.transaction((tx) => {
    const preset = tx
      .select({ id: presets.id })
      .from(presets)
      .where(and(eq(presets.id, id), eq(presets.userId, userId)))
      .get()
    if (!preset) return false
    tx.delete(presetItems).where(eq(presetItems.presetId, id)).run()
    tx.delete(presets).where(eq(presets.id, id)).run()
    return true
  })
}
