import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { sessions } from '../../db/schema.js'

export const SESSION_COOKIE = 'sid'
const COOKIE_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days
const BEARER_TTL_MS = 1000 * 60 * 60 * 24 * 90 // 90 days
// Sliding renewal: extend a bearer session when it is used within its last
// 30 days; throttle the write to once per day via lastUsedAt.
const RENEW_WINDOW_MS = 1000 * 60 * 60 * 24 * 30
const TOUCH_THROTTLE_MS = 1000 * 60 * 60 * 24
const TOKEN_PREFIX = 'eaz_'

export interface Session {
  id: string
  userId: string
  expiresAt: number
}

export interface SessionInfo {
  id: string
  kind: string
  deviceName: string | null
  platform: string | null
  createdAt: number
  lastUsedAt: number | null
  expiresAt: number
}

/** Only the sha256 of a bearer token is persisted; a DB leak stays useless. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function createSession(db: DB, userId: string): Session {
  const id = randomUUID()
  const now = Date.now()
  const expiresAt = now + COOKIE_TTL_MS
  db.insert(sessions).values({ id, userId, kind: 'cookie', createdAt: now, expiresAt }).run()
  return { id, userId, expiresAt }
}

export function createBearerSession(
  db: DB,
  userId: string,
  device: { deviceName?: string | null; platform?: string | null } = {},
): { token: string; session: Session } {
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url')
  const id = randomUUID()
  const now = Date.now()
  const expiresAt = now + BEARER_TTL_MS
  db.insert(sessions)
    .values({
      id,
      userId,
      tokenHash: hashToken(token),
      kind: 'bearer',
      deviceName: device.deviceName ?? null,
      platform: device.platform ?? null,
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    })
    .run()
  return { token, session: { id, userId, expiresAt } }
}

export function getSession(db: DB, id: string): Session | null {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!row) return null
  if (row.expiresAt < Date.now()) {
    db.delete(sessions).where(eq(sessions.id, id)).run()
    return null
  }
  return { id: row.id, userId: row.userId, expiresAt: row.expiresAt }
}

export function getSessionByToken(db: DB, rawToken: string): Session | null {
  if (!rawToken.startsWith(TOKEN_PREFIX)) return null
  const row = db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(rawToken))).get()
  if (!row) return null
  const now = Date.now()
  if (row.expiresAt < now) {
    db.delete(sessions).where(eq(sessions.id, row.id)).run()
    return null
  }
  let expiresAt = row.expiresAt
  if (now - (row.lastUsedAt ?? 0) >= TOUCH_THROTTLE_MS) {
    if (expiresAt - now < RENEW_WINDOW_MS) expiresAt = now + BEARER_TTL_MS
    db.update(sessions).set({ lastUsedAt: now, expiresAt }).where(eq(sessions.id, row.id)).run()
  }
  return { id: row.id, userId: row.userId, expiresAt }
}

export function deleteSession(db: DB, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run()
}

export function deleteSessionByToken(db: DB, rawToken: string): void {
  if (!rawToken.startsWith(TOKEN_PREFIX)) return
  db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawToken))).run()
}

export function listUserSessions(db: DB, userId: string): SessionInfo[] {
  return db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      deviceName: sessions.deviceName,
      platform: sessions.platform,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, Date.now())))
    .all()
}

/** Revoke one of the user's own sessions. Returns false when it isn't theirs. */
export function deleteUserSession(db: DB, userId: string, sessionId: string): boolean {
  const res = db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .run()
  return res.changes > 0
}
