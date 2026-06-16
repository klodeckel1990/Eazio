import { describe, it, expect } from 'vitest'
import { itemsToText } from './meal-photo.js'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'
import { setEntitlement } from '../billing/entitlements.js'

// photo-meal ist Premium-gated → Tests, die hinter den Gate kommen wollen,
// brauchen ein aktives Entitlement.
function makePremium(db: ReturnType<typeof createTestDb>, userId: string) {
  setEntitlement(db, userId, { status: 'active', premiumUntil: Date.now() + 3600_000, productId: 'p', store: 'app_store', rcAppUserId: userId })
}

describe('itemsToText', () => {
  it('formats detected items as ingredient lines the matcher parses', () => {
    expect(itemsToText([
      { name: 'Hähnchenbrust', amountG: 180 },
      { name: 'Basmatireis', amountG: 200 },
    ])).toBe('180 g Hähnchenbrust\n200 g Basmatireis')
  })
  it('rounds grams', () => {
    expect(itemsToText([{ name: 'Öl', amountG: 12.6 }])).toBe('13 g Öl')
  })
})

describe('POST /api/foods/photo-meal', () => {
  const IMG = 'x'.repeat(200) // dummy base64-ish payload past the min length

  it('requires auth', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'POST', url: '/api/foods/photo-meal', payload: { image: IMG, mediaType: 'image/jpeg' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 503 when the AI is unavailable (no API key in tests)', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const created = await app.inject({
      method: 'POST', url: '/api/auth/bootstrap',
      payload: { token: 'test-bootstrap-token', username: 'jens', password: 'pw-123456' },
    })
    expect(created.statusCode).toBe(201)
    makePremium(db, created.json().id)
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'jens', password: 'pw-123456' },
    })
    const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE)!
    const res = await app.inject({
      method: 'POST', url: '/api/foods/photo-meal',
      headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` },
      payload: { image: IMG, mediaType: 'image/jpeg' },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ error: 'ai_unavailable' })
  })

  it('rejects an invalid media type', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const created = await app.inject({
      method: 'POST', url: '/api/auth/bootstrap',
      payload: { token: 'test-bootstrap-token', username: 'jens', password: 'pw-123456' },
    })
    makePremium(db, created.json().id)
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login', payload: { username: 'jens', password: 'pw-123456' },
    })
    const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE)!
    const res = await app.inject({
      method: 'POST', url: '/api/foods/photo-meal',
      headers: { cookie: `${SESSION_COOKIE}=${cookie.value}` },
      payload: { image: IMG, mediaType: 'image/gif' },
    })
    expect(res.statusCode).toBe(400)
  })
})
