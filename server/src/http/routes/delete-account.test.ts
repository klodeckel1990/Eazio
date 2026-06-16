import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'
import { diaryEntries, pushTokens, userGoals, users } from '../../db/schema.js'

const BOOTSTRAP = 'test-bootstrap-token'

async function makeUser(app: ReturnType<typeof buildApp>, username: string) {
  const created = await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { token: BOOTSTRAP, username, password: 'pw-123456' },
  })
  const id = created.json().id as string
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: 'pw-123456' },
  })
  const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE)!
  return { id, cookieHeader: `${SESSION_COOKIE}=${cookie.value}` }
}

function seed(db: ReturnType<typeof createTestDb>, userId: string) {
  const now = Date.now()
  db.insert(diaryEntries).values({
    id: randomUUID(), userId, date: '2026-06-16', daytime: 'lunch',
    nameSnapshot: 'Test', amountG: 100, kcal: 200, origin: 'manual', createdAt: now, updatedAt: now,
  }).run()
  db.insert(pushTokens).values({
    id: randomUUID(), userId, token: `tok-${userId}`, platform: 'ios', createdAt: now, lastSeenAt: now,
  }).run()
  db.insert(userGoals).values({ userId, updatedAt: now }).run()
}

describe('DELETE /api/auth/me', () => {
  it('removes the user, their data and all sessions; keeps other users intact', async () => {
    const db = createTestDb()
    const app = buildApp(db)

    const victim = await makeUser(app, 'victim')
    const bystander = await makeUser(app, 'bystander')
    seed(db, victim.id)
    seed(db, bystander.id)

    const res = await app.inject({ method: 'DELETE', url: '/api/auth/me', headers: { cookie: victim.cookieHeader } })
    expect(res.statusCode).toBe(204)

    // session gone → me unauthenticated, re-login impossible
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: victim.cookieHeader } })
    expect(me.statusCode).toBe(401)
    const relogin = await app.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'victim', password: 'pw-123456' },
    })
    expect(relogin.statusCode).toBe(401)

    // victim's rows gone
    expect(db.select().from(users).where(eq(users.id, victim.id)).all()).toHaveLength(0)
    expect(db.select().from(diaryEntries).where(eq(diaryEntries.userId, victim.id)).all()).toHaveLength(0)
    expect(db.select().from(pushTokens).where(eq(pushTokens.userId, victim.id)).all()).toHaveLength(0)
    expect(db.select().from(userGoals).where(eq(userGoals.userId, victim.id)).all()).toHaveLength(0)

    // bystander untouched
    expect(db.select().from(users).where(eq(users.id, bystander.id)).all()).toHaveLength(1)
    expect(db.select().from(diaryEntries).where(eq(diaryEntries.userId, bystander.id)).all()).toHaveLength(1)
  })

  it('rejects unauthenticated deletion', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'DELETE', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })
})
