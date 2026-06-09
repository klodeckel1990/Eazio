import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from './users.repo.js'
import { sessions as sessionsTable } from '../../db/schema.js'
import {
  createBearerSession,
  createSession,
  deleteSession,
  deleteSessionByToken,
  deleteUserSession,
  getSession,
  getSessionByToken,
  hashToken,
  listUserSessions,
} from './sessions.js'

describe('sessions', () => {
  it('creates, fetches and deletes a session', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')

    const session = createSession(db, user.id)
    expect(session.id).toMatch(/[0-9a-f-]{36}/)
    expect(getSession(db, session.id)?.userId).toBe(user.id)

    deleteSession(db, session.id)
    expect(getSession(db, session.id)).toBeNull()
  })

  it('returns null for an expired session', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'exp', 'pw-123456')
    const id = randomUUID()
    db.insert(sessionsTable).values({ id, userId: user.id, expiresAt: Date.now() - 1000 }).run()
    expect(getSession(db, id)).toBeNull()
  })
})

describe('bearer sessions', () => {
  it('creates a token, resolves it, and revokes it', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'bear', 'pw-123456')

    const { token, session } = createBearerSession(db, user.id, { deviceName: 'iPhone', platform: 'ios' })
    expect(token).toMatch(/^eaz_[A-Za-z0-9_-]{43}$/)
    expect(getSessionByToken(db, token)?.userId).toBe(user.id)
    // The same row also resolves via its id (transitional cookie path).
    expect(getSession(db, session.id)?.userId).toBe(user.id)

    deleteSessionByToken(db, token)
    expect(getSessionByToken(db, token)).toBeNull()
  })

  it('never stores the raw token', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'hash', 'pw-123456')
    const { token, session } = createBearerSession(db, user.id)
    const row = db.select().from(sessionsTable).all().find((r) => r.id === session.id)
    expect(row?.tokenHash).toBe(hashToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it('rejects unknown, malformed and expired tokens', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'rej', 'pw-123456')
    expect(getSessionByToken(db, 'eaz_unknown')).toBeNull()
    expect(getSessionByToken(db, 'not-a-token')).toBeNull()

    const raw = 'eaz_expired-token'
    db.insert(sessionsTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        tokenHash: hashToken(raw),
        kind: 'bearer',
        createdAt: 0,
        expiresAt: Date.now() - 1000,
      })
      .run()
    expect(getSessionByToken(db, raw)).toBeNull()
  })

  it('slides the expiry when used close to expiration', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'slide', 'pw-123456')
    const raw = 'eaz_sliding-token'
    const id = randomUUID()
    const soon = Date.now() + 1000 * 60 * 60 * 24 * 10 // 10 days left, last used 2 days ago
    db.insert(sessionsTable)
      .values({
        id,
        userId: user.id,
        tokenHash: hashToken(raw),
        kind: 'bearer',
        createdAt: 0,
        lastUsedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
        expiresAt: soon,
      })
      .run()
    const session = getSessionByToken(db, raw)
    expect(session?.expiresAt).toBeGreaterThan(soon + 1000 * 60 * 60 * 24 * 60)
  })

  it('lists active sessions and revokes only own ones', async () => {
    const db = createTestDb()
    const alice = await createUser(db, 'alice', 'pw-123456')
    const bob = await createUser(db, 'bob', 'pw-123456')
    const { session } = createBearerSession(db, alice.id, { deviceName: 'iPhone', platform: 'ios' })
    createBearerSession(db, bob.id)

    const list = listUserSessions(db, alice.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: session.id, deviceName: 'iPhone', platform: 'ios' })

    expect(deleteUserSession(db, bob.id, session.id)).toBe(false)
    expect(deleteUserSession(db, alice.id, session.id)).toBe(true)
    expect(listUserSessions(db, alice.id)).toHaveLength(0)
  })
})
