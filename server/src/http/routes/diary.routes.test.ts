import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { upsertSourcedFood } from '../../modules/foods/foods.repo.js'
import { buildSearchTerms } from '../../modules/foods/search-terms.js'

// Keep the OFF text-search fallback off the network in tests.
vi.mock('../../modules/foods/off.client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../modules/foods/off.client.js')>()
  return { ...mod, searchOffProducts: vi.fn(async () => []) }
})

const BOOTSTRAP = 'test-bootstrap-token'

async function login(app: ReturnType<typeof buildApp>, username: string) {
  await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { token: BOOTSTRAP, username, password: 'pw-123456' },
  })
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: 'pw-123456' },
  })
  return { authorization: `Bearer ${(res.json() as { token: string }).token}` }
}

function seedBanana(db: ReturnType<typeof createTestDb>) {
  const now = Date.now()
  upsertSourcedFood(db, {
    id: 'bls:F503100',
    source: 'bls',
    sourceId: 'F503100',
    name: 'Banane roh',
    searchTerms: buildSearchTerms('Banane roh'),
    kcal: 79,
    protein: 1.3,
    fat: 0.4,
    carbs: 15.9,
    sugar: 13.9,
    fiber: 2,
    createdAt: now,
    updatedAt: now,
  })
}

describe('diary routes', () => {
  it('logs food-referencing and free-form lines, computes snapshots and day totals', async () => {
    const db = createTestDb()
    seedBanana(db)
    const app = buildApp(db)
    const auth = await login(app, 'diarist')

    const created = await app.inject({
      method: 'POST',
      url: '/api/diary/entries',
      headers: auth,
      payload: {
        date: '2026-06-09',
        daytime: 'breakfast',
        lines: [
          { foodId: 'bls:F503100', amountG: 200, rawText: 'Banane' },
          { name: 'Omas Kuchen', kcal: 350, carbs: 40, amountG: 90 },
        ],
      },
    })
    expect(created.statusCode).toBe(201)
    const body = created.json() as {
      entries: { nameSnapshot: string; kcal: number; mirrorStatus: string | null }[]
      streak: { currentStreak: number }
      mirrorQueued: boolean
    }
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0]).toMatchObject({ nameSnapshot: 'Banane roh', kcal: 158 }) // 79 * 2
    expect(body.entries[1]).toMatchObject({ nameSnapshot: 'Omas Kuchen', kcal: 350 })
    expect(body.streak.currentStreak).toBe(1)
    expect(body.mirrorQueued).toBe(false) // no yazio account linked

    const day = await app.inject({ method: 'GET', url: '/api/diary?date=2026-06-09', headers: auth })
    expect(day.statusCode).toBe(200)
    const dayBody = day.json() as {
      totals: { kcal: number }
      remainingKcal: number
      goals: { kcalTarget: number }
      entries: unknown[]
    }
    expect(dayBody.totals.kcal).toBe(508)
    expect(dayBody.goals.kcalTarget).toBe(2000)
    expect(dayBody.remainingKcal).toBe(1492)
    expect(dayBody.entries).toHaveLength(2)
  })

  it('learns a food alias from rawText and prefers it on the next match', async () => {
    const db = createTestDb()
    seedBanana(db)
    const app = buildApp(db)
    const auth = await login(app, 'learner')

    await app.inject({
      method: 'POST',
      url: '/api/diary/entries',
      headers: auth,
      payload: { lines: [{ foodId: 'bls:F503100', amountG: 130, rawText: 'banane' }] },
    })

    const match = await app.inject({
      method: 'POST',
      url: '/api/foods/match',
      headers: auth,
      payload: { text: '1 Banane' },
    })
    expect(match.statusCode).toBe(200)
    const { lines } = match.json() as {
      lines: { selectedFoodId: string; suggestedAmountG: number }[]
    }
    expect(lines[0]).toMatchObject({ selectedFoodId: 'bls:F503100', suggestedAmountG: 130 })
  })

  it('rescales snapshots when the amount is patched', async () => {
    const db = createTestDb()
    seedBanana(db)
    const app = buildApp(db)
    const auth = await login(app, 'patcher')
    const created = await app.inject({
      method: 'POST',
      url: '/api/diary/entries',
      headers: auth,
      payload: { lines: [{ foodId: 'bls:F503100', amountG: 100 }] },
    })
    const id = (created.json() as { entries: { id: string }[] }).entries[0]!.id

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/diary/entries/${id}`,
      headers: auth,
      payload: { amountG: 50, daytime: 'snack' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json()).toMatchObject({ amountG: 50, kcal: 39.5, daytime: 'snack' })
  })

  it('deletes entries and rejects foreign access (isolation)', async () => {
    const db = createTestDb()
    seedBanana(db)
    const app = buildApp(db)
    const alice = await login(app, 'alice-diary')
    const bob = await login(app, 'bob-diary')

    const created = await app.inject({
      method: 'POST',
      url: '/api/diary/entries',
      headers: alice,
      payload: { date: '2026-06-09', lines: [{ foodId: 'bls:F503100', amountG: 100 }] },
    })
    const id = (created.json() as { entries: { id: string }[] }).entries[0]!.id

    // bob sees an empty day and cannot touch alice's entry
    const bobDay = await app.inject({ method: 'GET', url: '/api/diary?date=2026-06-09', headers: bob })
    expect((bobDay.json() as { entries: unknown[] }).entries).toHaveLength(0)
    expect(
      (await app.inject({ method: 'PATCH', url: `/api/diary/entries/${id}`, headers: bob, payload: { amountG: 1 } }))
        .statusCode,
    ).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/api/diary/entries/${id}`, headers: bob })).statusCode).toBe(404)

    expect((await app.inject({ method: 'DELETE', url: `/api/diary/entries/${id}`, headers: alice })).statusCode).toBe(204)
    expect((await app.inject({ method: 'DELETE', url: `/api/diary/entries/${id}`, headers: alice })).statusCode).toBe(404)
  })

  it('tracks water with add/delete and day totals', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const auth = await login(app, 'hydrated')

    const w1 = await app.inject({
      method: 'POST',
      url: '/api/diary/water',
      headers: auth,
      payload: { ml: 250, date: '2026-06-09' },
    })
    expect(w1.statusCode).toBe(201)
    await app.inject({ method: 'POST', url: '/api/diary/water', headers: auth, payload: { ml: 500, date: '2026-06-09' } })

    const day = await app.inject({ method: 'GET', url: '/api/diary?date=2026-06-09', headers: auth })
    expect((day.json() as { water: { totalMl: number } }).water.totalMl).toBe(750)

    const id = (w1.json() as { id: string }).id
    expect((await app.inject({ method: 'DELETE', url: `/api/diary/water/${id}`, headers: auth })).statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: '/api/diary?date=2026-06-09', headers: auth })
    expect((after.json() as { water: { totalMl: number } }).water.totalMl).toBe(500)
  })

  it('serves and updates goals', async () => {
    const db = createTestDb()
    const app = buildApp(db)
    const auth = await login(app, 'goalsetter')

    const initial = await app.inject({ method: 'GET', url: '/api/goals', headers: auth })
    expect(initial.json()).toMatchObject({ kcalTarget: 2000, waterMl: 2000 })

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/goals',
      headers: auth,
      payload: { kcalTarget: 1800, proteinG: 120, waterMl: 2500 },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({ kcalTarget: 1800, proteinG: 120, waterMl: 2500 })
  })

  it('returns the widget summary shape', async () => {
    const db = createTestDb()
    seedBanana(db)
    const app = buildApp(db)
    const auth = await login(app, 'widgety')
    await app.inject({
      method: 'PUT',
      url: '/api/goals',
      headers: auth,
      payload: { kcalTarget: 1800 },
    })
    await app.inject({
      method: 'POST',
      url: '/api/diary/entries',
      headers: auth,
      payload: { date: '2026-06-09', lines: [{ foodId: 'bls:F503100', amountG: 200 }] },
    })
    await app.inject({ method: 'POST', url: '/api/diary/water', headers: auth, payload: { ml: 250, date: '2026-06-09' } })

    const res = await app.inject({ method: 'GET', url: '/api/widget/summary?date=2026-06-09', headers: auth })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      date: '2026-06-09',
      kcalTarget: 1800,
      kcalConsumed: 158,
      kcalRemaining: 1642,
      waterMl: 250,
      waterTargetMl: 2000,
      streak: 1,
    })
  })

  it('requires auth on all diary endpoints', async () => {
    const app = buildApp(createTestDb())
    for (const [method, url] of [
      ['GET', '/api/diary'],
      ['POST', '/api/diary/entries'],
      ['GET', '/api/goals'],
      ['GET', '/api/widget/summary'],
    ] as const) {
      const res = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined })
      expect(res.statusCode, `${method} ${url}`).toBe(401)
    }
  })
})
