import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { upsertSourcedFood } from '../../modules/foods/foods.repo.js'
import { buildSearchTerms } from '../../modules/foods/search-terms.js'
import { fetchOffProduct, searchOffProducts, OffUnavailableError } from '../../modules/foods/off.client.js'

vi.mock('../../modules/foods/off.client.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../modules/foods/off.client.js')>()
  return { ...mod, fetchOffProduct: vi.fn(), searchOffProducts: vi.fn() }
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
  vi.mocked(searchOffProducts).mockReset()
  vi.mocked(searchOffProducts).mockResolvedValue([])
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

  it('suggests piece weights from servings, scaled by count and picked by unit word', async () => {
    const db = createTestDb()
    const now = Date.now()
    upsertSourcedFood(db, {
      id: 'bls:BAN',
      source: 'bls',
      sourceId: 'BAN',
      name: 'Banane roh',
      searchTerms: buildSearchTerms('Banane roh'),
      kcal: 79,
      servingsJson: JSON.stringify([{ label: 'Stück', grams: 120 }]),
      createdAt: now,
      updatedAt: now,
    })
    upsertSourcedFood(db, {
      id: 'bls:RAD',
      source: 'bls',
      sourceId: 'RAD',
      name: 'Radieschen roh',
      searchTerms: buildSearchTerms('Radieschen roh'),
      kcal: 16,
      servingsJson: JSON.stringify([
        { label: 'Stück', grams: 10 },
        { label: 'Bund', grams: 120 },
      ]),
      createdAt: now,
      updatedAt: now,
    })
    const app = buildApp(db)
    const auth = await login(app, 'pieces')

    const res = await app.inject({
      method: 'POST',
      url: '/api/foods/match',
      headers: auth,
      payload: { text: '1 Banane\n2 Bananen\n1 Bund Radieschen\n5 Radieschen\n150g Banane' },
    })
    expect(res.statusCode).toBe(200)
    const { lines } = res.json() as { lines: { raw: string; suggestedAmountG: number }[] }
    const byRaw = Object.fromEntries(lines.map((l) => [l.raw, l.suggestedAmountG]))
    expect(byRaw['1 Banane']).toBe(120)
    expect(byRaw['2 Bananen']).toBe(240)
    expect(byRaw['1 Bund Radieschen']).toBe(120) // unit word picks the Bund serving
    expect(byRaw['5 Radieschen']).toBe(50) // 5 × Stück 10 g
    expect(byRaw['150g Banane']).toBe(150) // explicit grams always win
  })

  it('falls back to OFF text search when the local index is sparse and caches results', async () => {
    const app = buildApp(createTestDb())
    const auth = await login(app, 'sparse')
    vi.mocked(searchOffProducts).mockResolvedValue([
      {
        code: '4250350590126',
        product_name_de: 'Designer Whey Proteinpulver',
        brands: 'ESN',
        nutriments: { 'energy-kcal_100g': 370, proteins_100g: 80 },
      },
    ])

    const res = await app.inject({ method: 'GET', url: '/api/foods/search?q=proteinpulver', headers: auth })
    expect(res.statusCode).toBe(200)
    const { results } = res.json() as { results: { name: string; source: string }[] }
    expect(results).toContainEqual(
      expect.objectContaining({ name: 'Designer Whey Proteinpulver', source: 'off', kcal: 370 }),
    )

    // second search is served from the cache without another OFF call
    vi.mocked(searchOffProducts).mockClear()
    vi.mocked(searchOffProducts).mockResolvedValue([])
    const second = await app.inject({ method: 'GET', url: '/api/foods/search?q=proteinpulver', headers: auth })
    const cached = (second.json() as { results: { name: string }[] }).results
    expect(cached.some((r) => r.name === 'Designer Whey Proteinpulver')).toBe(true)
  })

  it('skips the OFF fallback when local results are plentiful', async () => {
    const db = createTestDb()
    const now = Date.now()
    for (let i = 0; i < 4; i++) {
      upsertSourcedFood(db, {
        id: `bls:A${i}`,
        source: 'bls',
        sourceId: `A${i}`,
        name: `Apfelsorte ${i}`,
        searchTerms: buildSearchTerms(`Apfelsorte ${i}`),
        kcal: 52,
        createdAt: now,
        updatedAt: now,
      })
    }
    const app = buildApp(db)
    const auth = await login(app, 'plenty')
    const res = await app.inject({ method: 'GET', url: '/api/foods/search?q=apfelsorte', headers: auth })
    expect((res.json() as { results: unknown[] }).results).toHaveLength(4)
    expect(searchOffProducts).not.toHaveBeenCalled()
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
