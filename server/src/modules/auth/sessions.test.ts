import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from './users.repo.js'
import { sessions as sessionsTable } from '../../db/schema.js'
import { createSession, getSession, deleteSession } from './sessions.js'

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
