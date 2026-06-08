import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { presets, presetItems } from '../../db/schema.js'

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
    })
    .from(presetItems)
    .where(eq(presetItems.presetId, id))
    .orderBy(asc(presetItems.position))
    .all()
  return { ...preset, items }
}

export function deletePreset(db: DB, userId: string, id: string): boolean {
  const preset = db
    .select({ id: presets.id })
    .from(presets)
    .where(and(eq(presets.id, id), eq(presets.userId, userId)))
    .get()
  if (!preset) return false
  db.transaction((tx) => {
    tx.delete(presetItems).where(eq(presetItems.presetId, id)).run()
    tx.delete(presets).where(eq(presets.id, id)).run()
  })
  return true
}
