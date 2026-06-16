import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { subscriptions } from '../../db/schema.js'

export interface Entitlement {
  status: string // active|expired|cancelled|billing_issue|paused|none
  premiumUntil: number | null
  productId: string | null
  store: string | null
}

export function getEntitlement(db: DB, userId: string): Entitlement {
  const row = db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get()
  if (!row) return { status: 'none', premiumUntil: null, productId: null, store: null }
  return {
    status: row.status,
    premiumUntil: row.premiumUntil,
    productId: row.productId,
    store: row.store,
  }
}

/**
 * Single source of truth for "is this user premium right now". Access is granted
 * purely by the paid-through timestamp, so a *cancelled* (auto-renew off) sub
 * stays premium until it actually expires; EXPIRATION moves premiumUntil into
 * the past and access ends. `now` is injectable for tests.
 */
export function isPremium(db: DB, userId: string, now = Date.now()): boolean {
  const row = db
    .select({ premiumUntil: subscriptions.premiumUntil })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get()
  return row?.premiumUntil != null && row.premiumUntil > now
}

export interface EntitlementUpdate {
  status: string
  premiumUntil: number | null
  productId: string | null
  store: string | null
  rcAppUserId: string | null
}

/** Upsert — only ever called from the verified RevenueCat webhook handler. */
export function setEntitlement(db: DB, userId: string, u: EntitlementUpdate, now = Date.now()): void {
  db.insert(subscriptions)
    .values({ userId, ...u, updatedAt: now })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { ...u, updatedAt: now },
    })
    .run()
}
