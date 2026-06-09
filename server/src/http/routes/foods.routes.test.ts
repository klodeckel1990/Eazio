import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { upsertSourcedFood } from '../../modules/foods/foods.repo.js'
import { buildSearchTerms } from '../../modules/foods/search-terms.js'
import { fetchOffProduct, OffUnavailableError } from '../../modules/foods/off.client.js'

vi.mock('../../modules/foods/off.client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../modules/foods/off.client.js')>()
  return { ...mod, fetchOffProduct: vi.fn() }
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
  const { token } = res.json() as { token: string }
  return { authorization: `Bearer ${token}` }
}

function seedBls(db: ReturnType<typeof createTestDb>) {
  const now = Date.now()
  upsertSourcedFood(db, {
    id: 'bls:B100000',
    source: 'bls',
    sourceId: 'B100000',
    name: 'Banane roh',
    searchTerms: buildSearchTerms('Banane roh'),
    kcal: 79,
    carbs: 20,
    createdAt: now,
    updatedAt: now,
  })
}

beforeEach(() => {
  vi.mocked(fetchOffProduct).mockReset()
})

describe('foods routes', () => {
  it('requires auth everywhere', async () => {
    const app = buildApp(createTestDb())
    for (const [method, url] of [
      ['GET', '/api/foods/search?q=banane'],
      ['GET', '/api/foods/barcode/40000000'],
      ['GET', '/api/foods/some-id'],
      ['POST', '/api/foods'],
    ] as const) {
      const res = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined })
      expect(res.statusCode, `${method} ${url}`).toBe(401)
    }
  })

  it('searches seeded foods', async () => {
    const db = createTestDb()
    seedBls(db)
    const app = buildApp(db)
    const auth = await login(app, 'searcher')
    const res = await app.inject({ method: 'GET', url: '/api/foods/search?q=banane', headers: auth })
    expect(res.statusCode).toBe(200)
    const { results } = res.json() as { results: { name: string; kcal: number }[] }
    expect(results[0]).toMatchObject({ name: 'Banane roh', kcal: 79 })
  })

  it('rejects a malformed search query', async () => {
    const app = buildApp(createTestDb())
    const auth = await login(app, 'badsearch')
    const res = await app.inject({ method: 'GET', url: '/api/foods/search?q=', headers: auth })
    expect(res.statusCode).toBe(400)
  })

  it('creates, reads, updates and deletes a custom food — invisible to others', async () => {
    const app = buildApp(createTestDb())
    const alice = await login(app, 'alice')
    const bob = await login(app, 'bob')

    const created = await app.inject({
      method: 'POST',
      url: '/api/foods',
      headers: alice,
      payload: { name: 'Protein-Shake Vanille', kcal: 110, protein: 22, servings: [{ label: 'Shaker', grams: 300 }] },
    })
    expect(created.statusCode).toBe(201)
    const food = created.json() as { id: string; isOwn: boolean }
    expect(food.isOwn).toBe(true)

    // owner sees it, others don't
    expect((await app.inject({ method: 'GET', url: `/api/foods/${food.id}`, headers: alice })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/foods/${food.id}`, headers: bob })).statusCode).toBe(404)
    expect(
      ((await app.inject({ method: 'GET', url: '/api/foods/search?q=vanille', headers: bob })).json() as { results: unknown[] })
        .results,
    ).toHaveLength(0)

    // foreign update/delete are 404, own update works
    expect(
      (await app.inject({ method: 'PATCH', url: `/api/foods/${food.id}`, headers: bob, payload: { kcal: 1 } })).statusCode,
    ).toBe(404)
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/foods/${food.id}`, headers: bob })).statusCode,
    ).toBe(404)
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/foods/${food.id}`,
      headers: alice,
      payload: { kcal: 115 },
    })
    expect(patched.statusCode).toBe(200)
    expect((patched.json() as { kcal: number }).kcal).toBe(115)

    expect((await app.inject({ method: 'DELETE', url: `/api/foods/${food.id}`, headers: alice })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/foods/${food.id}`, headers: alice })).statusCode).toBe(404)
  })

  it('resolves an unknown barcode via OFF and caches it', async () => {
    const app = buildApp(createTestDb())
    const auth = await login(app, 'scanner')
    vi.mocked(fetchOffProduct).mockResolvedValue({
      code: '4000417025005',
      product_name_de: 'Schokolade Alpenmilch',
      brands: 'Milka',
      nutriments: { 'energy-kcal_100g': 530, fat_100g: 29.5 },
    })

    const first = await app.inject({ method: 'GET', url: '/api/foods/barcode/4000417025005', headers: auth })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ name: 'Schokolade Alpenmilch', brand: 'Milka', source: 'off', kcal: 530 })
    expect(fetchOffProduct).toHaveBeenCalledTimes(1)

    // second hit comes from the local cache
    const second = await app.inject({ method: 'GET', url: '/api/foods/barcode/4000417025005', headers: auth })
    expect(second.statusCode).toBe(200)
    expect(fetchOffProduct).toHaveBeenCalledTimes(1)
  })

  it('maps OFF misses to 404 and outages to 503', async () => {
    const app = buildApp(createTestDb())
    const auth = await login(app, 'scanner2')

    vi.mocked(fetchOffProduct).mockResolvedValue(null)
    expect((await app.inject({ method: 'GET', url: '/api/foods/barcode/40000000', headers: auth })).statusCode).toBe(404)

    vi.mocked(fetchOffProduct).mockRejectedValue(new OffUnavailableError())
    expect((await app.inject({ method: 'GET', url: '/api/foods/barcode/40000001', headers: auth })).statusCode).toBe(503)

    // invalid EAN shape -> validation error
    expect((await app.inject({ method: 'GET', url: '/api/foods/barcode/123', headers: auth })).statusCode).toBe(400)
  })
})
