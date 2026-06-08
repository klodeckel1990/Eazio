import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { sessions } from '../../db/schema.js'

export const SESSION_COOKIE = 'sid'
const TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 Tage

export interface Session {
  id: string
  userId: string
  expiresAt: number
}

export function createSession(db: DB, userId: string): Session {
  const id = randomUUID()
  const expiresAt = Date.now() + TTL_MS
  db.insert(sessions).values({ id, userId, expiresAt }).run()
  return { id, userId, expiresAt }
}

export function getSession(db: DB, id: string): Session | null {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!row) return null
  if (row.expiresAt < Date.now()) {
    db.delete(sessions).where(eq(sessions.id, id)).run()
    return null
  }
  return row
}

export function deleteSession(db: DB, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run()
}
