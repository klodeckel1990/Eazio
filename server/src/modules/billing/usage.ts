import { randomUUID } from 'node:crypto'
import { and, eq, gte, sql } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { usageEvents } from '../../db/schema.js'

export type UsageKind = 'recipe_import'

export const FREE_RECIPE_IMPORTS_PER_WEEK = 5
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Count a user's usage events of one kind since `sinceMs` (rolling window). */
export function countUsageSince(db: DB, userId: string, kind: UsageKind, sinceMs: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), eq(usageEvents.kind, kind), gte(usageEvents.createdAt, sinceMs)))
    .get()
  return row?.n ?? 0
}

/** Record one usage event (e.g. a recipe import) for rolling free-tier limits. */
export function recordUsage(db: DB, userId: string, kind: UsageKind, now = Date.now()): void {
  db.insert(usageEvents).values({ id: randomUUID(), userId, kind, createdAt: now }).run()
}
