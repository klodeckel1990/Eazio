import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../auth/sessions.js'
import { parseRcEvent } from './revenuecat.js'
import { isPremium, setEntitlement, getEntitlement } from './entitlements.js'
import { recordUsage, countUsageSince } from './usage.js'
import { createUser } from '../auth/users.repo.js'
import { users } from '../../db/schema.js'

const HOUR = 3600_000

// Minimaler User-Row für Unit-Tests (FK auf users.id ist aktiv).
function seedUser(db: ReturnType<typeof createTestDb>, id: string) {
  db.insert(users).values({ id, username: id, passwordHash: 'x', createdAt: 0 }).run()
}

describe('parseRcEvent', () => {
  it('maps INITIAL_PURCHASE to active with the expiry', () => {
    const r = parseRcEvent({ type: 'INITIAL_PURCHASE', app_user_id: 'u1', product_id: 'p', expiration_at_ms: 123, store: 'APP_STORE' })
    expect(r).toEqual({
      appUserId: 'u1',
      update: { status: 'active', premiumUntil: 123, productId: 'p', store: 'app_store', rcAppUserId: 'u1' },
    })
  })
  it('keeps the expiry on CANCELLATION (access until then)', () => {
    expect(parseRcEvent({ type: 'CANCELLATION', app_user_id: 'u1', expiration_at_ms: 999 })?.update.status).toBe('cancelled')
    expect(parseRcEvent({ type: 'CANCELLATION', app_user_id: 'u1', expiration_at_ms: 999 })?.update.premiumUntil).toBe(999)
  })
  it('ignores anonymous ids and irrelevant types', () => {
    expect(parseRcEvent({ type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc' })).toBeNull()
    expect(parseRcEvent({ type: 'TEST', app_user_id: 'u1' })).toBeNull()
  })
})

describe('isPremium', () => {
  it('is true only while premiumUntil is in the future', () => {
    const db = createTestDb()
    seedUser(db, 'u1')
    const now = 1_000_000
    setEntitlement(db, 'u1', { status: 'active', premiumUntil: now + HOUR, productId: 'p', store: 'app_store', rcAppUserId: 'u1' }, now)
    expect(isPremium(db, 'u1', now)).toBe(true)
    expect(isPremium(db, 'u1', now + 2 * HOUR)).toBe(false) // expired
    expect(isPremium(db, 'nobody', now)).toBe(false)
  })
})

describe('usage counter', () => {
  it('counts events within the rolling window', () => {
    const db = createTestDb()
    seedUser(db, 'u1')
    const now = 10 * HOUR
    recordUsage(db, 'u1', 'recipe_import', now - 3 * HOUR)
    recordUsage(db, 'u1', 'recipe_import', now - HOUR)
    expect(countUsageSince(db, 'u1', 'recipe_import', now - 2 * HOUR)).toBe(1)
    expect(countUsageSince(db, 'u1', 'recipe_import', now - 5 * HOUR)).toBe(2)
  })
})

describe('POST /api/billing/revenuecat/webhook', () => {
  it('rejects a wrong/missing secret', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'POST', url: '/api/billing/revenuecat/webhook', payload: { event: { type: 'INITIAL_PURCHASE' } } })
    expect(res.statusCode).toBe(401)
  })

  it('applies an entitlement for a known user', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const user = await createUser(db, 'jens', 'pw-123456')
    const res = await app.inject({
      method: 'POST', url: '/api/billing/revenuecat/webhook',
      headers: { authorization: 'test-rc-secret' },
      payload: { event: { type: 'INITIAL_PURCHASE', app_user_id: user.id, product_id: 'tellerwert.premium.yearly', expiration_at_ms: Date.now() + 30 * 24 * HOUR, store: 'APP_STORE' } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ applied: true })
    expect(isPremium(db, user.id)).toBe(true)
    expect(getEntitlement(db, user.id).productId).toBe('tellerwert.premium.yearly')
  })

  it('acks but does not apply for an unknown user', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const res = await app.inject({
      method: 'POST', url: '/api/billing/revenuecat/webhook',
      headers: { authorization: 'test-rc-secret' },
      payload: { event: { type: 'INITIAL_PURCHASE', app_user_id: 'ghost', expiration_at_ms: Date.now() + HOUR } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ applied: false })
  })
})

describe('gating', () => {
  async function authedUser(db: ReturnType<typeof createTestDb>, app: ReturnType<typeof buildApp>, name: string) {
    await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { token: 'test-bootstrap-token', username: name, password: 'pw-123456' } })
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: name, password: 'pw-123456' } })
    const id = login.json().id as string
    const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE)!
    return { id, cookie: `${SESSION_COOKIE}=${cookie.value}` }
  }

  it('blocks recipe import after 5 in a week for free users', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const u = await authedUser(db, app, 'free')
    for (let i = 0; i < 5; i++) recordUsage(db, u.id, 'recipe_import')
    const res = await app.inject({ method: 'POST', url: '/api/recipes/import', headers: { cookie: u.cookie }, payload: { text: 'x' } })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: 'free_limit_reached', limit: 5 })
  })

  it('lets premium users past the import limit', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const u = await authedUser(db, app, 'prem')
    for (let i = 0; i < 5; i++) recordUsage(db, u.id, 'recipe_import')
    setEntitlement(db, u.id, { status: 'active', premiumUntil: Date.now() + HOUR, productId: 'p', store: 'app_store', rcAppUserId: u.id })
    const res = await app.inject({ method: 'POST', url: '/api/recipes/import', headers: { cookie: u.cookie }, payload: { text: 'x' } })
    // past the limit gate → fails only at the AI-availability check (no key in tests)
    expect(res.statusCode).toBe(503)
  })

  it('gates photo-meal behind premium', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const free = await authedUser(db, app, 'free2')
    const img = 'x'.repeat(200)
    const blocked = await app.inject({ method: 'POST', url: '/api/foods/photo-meal', headers: { cookie: free.cookie }, payload: { image: img, mediaType: 'image/jpeg' } })
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json()).toMatchObject({ error: 'premium_required' })

    setEntitlement(db, free.id, { status: 'active', premiumUntil: Date.now() + HOUR, productId: 'p', store: 'app_store', rcAppUserId: free.id })
    const allowed = await app.inject({ method: 'POST', url: '/api/foods/photo-meal', headers: { cookie: free.cookie }, payload: { image: img, mediaType: 'image/jpeg' } })
    expect(allowed.statusCode).toBe(503) // past the premium gate → fails at AI (no key)
  })
})
