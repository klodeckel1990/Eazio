import { describe, it, expect, vi, beforeEach } from 'vitest'

const add = vi.fn().mockResolvedValue(undefined)
const remove = vi.fn().mockResolvedValue(undefined)
vi.mock('../../modules/yazio/client.js', () => ({
  buildYazioClient: () => ({ user: { addConsumedItem: add, removeConsumedItem: remove } }),
  verifyCredentials: vi.fn(),
}))

import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'
import { createAccount } from '../../modules/accounts/accounts.repo.js'

const BOOTSTRAP = 'test-bootstrap-token'
async function authed() {
  const db = createTestDb()
  const app = buildApp(db)
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { token: BOOTSTRAP, username: 'jens', password: 'pw-123456' } })
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'jens', password: 'pw-123456' } })
  const cookie = `${SESSION_COOKIE}=${login.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
  return { db, app, cookie, userId: me.json().id as string }
}

beforeEach(() => { add.mockClear(); remove.mockClear() })

describe('POST /api/log', () => {
  it('409 when no account', async () => {
    const { app, cookie } = await authed()
    const res = await app.inject({ method: 'POST', url: '/api/log', headers: { cookie }, payload: { daytime: 'breakfast', date: '2026-06-08', lines: [{ productId: 'p1', name: 'X', amountGrams: 80 }] } })
    expect(res.statusCode).toBe(409)
  })

  it('logs lines and supports undo', async () => {
    const { db, app, cookie, userId } = await authed()
    createAccount(db, userId, 'Me', { username: 'me@x.de', password: 'secret' })

    const log = await app.inject({ method: 'POST', url: '/api/log', headers: { cookie }, payload: { date: '2026-06-08', daytime: 'breakfast', lines: [{ productId: 'p1', name: 'Haferflocken', amountGrams: 80 }] } })
    expect(log.statusCode).toBe(201)
    expect(add).toHaveBeenCalledTimes(1)
    const logId = log.json().logId as string

    const undo = await app.inject({ method: 'POST', url: `/api/log/${logId}/undo`, headers: { cookie } })
    expect(undo.statusCode).toBe(204)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('auto-resolves daytime when omitted', async () => {
    const { db, app, cookie, userId } = await authed()
    createAccount(db, userId, 'Me', { username: 'me@x.de', password: 'secret' })
    const log = await app.inject({ method: 'POST', url: '/api/log', headers: { cookie }, payload: { lines: [{ productId: 'p1', name: 'X', amountGrams: 80 }] } })
    expect(log.statusCode).toBe(201)
    expect(['breakfast', 'lunch', 'dinner', 'snack']).toContain(log.json().daytime)
  })

  it('400 when serving is set without servingQuantity', async () => {
    const { db, app, cookie, userId } = await authed()
    createAccount(db, userId, 'Me', { username: 'me@x.de', password: 'secret' })
    const res = await app.inject({
      method: 'POST', url: '/api/log', headers: { cookie },
      payload: { lines: [{ productId: 'p1', name: 'X', amountGrams: 80, serving: 'portion' }] },
    })
    expect(res.statusCode).toBe(400)
  })
})
