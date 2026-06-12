import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { pushReminders, pushTokens } from '../../db/schema.js'
import type { ApnsEnv } from './apns.js'

export interface PushTokenRow {
  id: string
  userId: string
  token: string
  platform: string
  apnsEnv: string | null
}

/** Idempotent: meldet sich ein anderes Konto auf demselben Gerät an, wandert
 *  das Token mit — ein Gerät bekommt nie Pushes für den vorherigen Nutzer. */
export function upsertToken(db: DB, userId: string, token: string, platform: string): void {
  const now = Date.now()
  const existing = db.select().from(pushTokens).where(eq(pushTokens.token, token)).get()
  if (existing) {
    db.update(pushTokens)
      .set({ userId, platform, lastSeenAt: now })
      .where(eq(pushTokens.id, existing.id))
      .run()
    return
  }
  db.insert(pushTokens)
    .values({ id: randomUUID(), userId, token, platform, createdAt: now, lastSeenAt: now })
    .run()
}

export function deleteToken(db: DB, token: string): void {
  db.delete(pushTokens).where(eq(pushTokens.token, token)).run()
}

export function listUserTokens(db: DB, userId: string): PushTokenRow[] {
  return db
    .select({
      id: pushTokens.id,
      userId: pushTokens.userId,
      token: pushTokens.token,
      platform: pushTokens.platform,
      apnsEnv: pushTokens.apnsEnv,
    })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId))
    .all()
}

/** Nutzer-IDs, die mindestens ein Gerät registriert haben. */
export function listUserIdsWithTokens(db: DB): string[] {
  return db
    .selectDistinct({ userId: pushTokens.userId })
    .from(pushTokens)
    .all()
    .map((r) => r.userId)
}

export function setTokenEnv(db: DB, id: string, env: ApnsEnv): void {
  db.update(pushTokens).set({ apnsEnv: env }).where(eq(pushTokens.id, id)).run()
}

export function removeTokenById(db: DB, id: string): void {
  db.delete(pushTokens).where(eq(pushTokens.id, id)).run()
}

export function lastReminderDate(db: DB, userId: string): string | null {
  return (
    db.select().from(pushReminders).where(eq(pushReminders.userId, userId)).get()?.lastSentDate ??
    null
  )
}

export function markReminderSent(db: DB, userId: string, date: string): void {
  db.insert(pushReminders)
    .values({ userId, lastSentDate: date })
    .onConflictDoUpdate({ target: pushReminders.userId, set: { lastSentDate: date } })
    .run()
}
