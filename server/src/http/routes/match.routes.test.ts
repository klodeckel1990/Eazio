import { describe, it, expect, vi, beforeEach } from 'vitest'

const search = vi.fn()
vi.mock('../../modules/yazio/client.js', () => ({
  buildYazioClient: () => ({ products: { search } }),
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

beforeEach(() => search.mockReset())

describe('POST /api/match', () => {
  it('401 without auth', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'POST', url: '/api/match', payload: { text: 'x' } })
    expect(res.statusCode).toBe(401)
  })

  it('409 when the user has no account', async () => {
    const { app, cookie } = await authed()
    const res = await app.inject({ method: 'POST', url: '/api/match', headers: { cookie }, payload: { text: '80g Haferflocken' } })
    expect(res.statusCode).toBe(409)
  })

  it('matches against the default account', async () => {
    const { db, app, cookie, userId } = await authed()
    createAccount(db, userId, 'Me', { username: 'me@x.de', password: 'secret' })
    search.mockResolvedValue([
      { product_id: 'p1', name: 'Haferflocken', producer: 'ACME', is_verified: true, base_unit: 'g', amount: 100, serving: 'portion', serving_quantity: 1, nutrients: { 'energy.energy': 350, 'nutrient.carb': 60, 'nutrient.protein': 12, 'nutrient.fat': 7 } },
    ])
    const res = await app.inject({ method: 'POST', url: '/api/match', headers: { cookie }, payload: { text: '80g Haferflocken' } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.lines).toHaveLength(1)
    expect(body.lines[0].amountGrams).toBe(80)
    expect(body.lines[0].candidates[0].productId).toBe('p1')
  })
})
