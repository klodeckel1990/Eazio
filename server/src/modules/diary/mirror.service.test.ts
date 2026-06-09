import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount } from '../accounts/accounts.repo.js'
import { upsertSourcedFood } from '../foods/foods.repo.js'
import { upsertAlias } from '../learning/aliases.repo.js'
import { createEntries } from './diary.service.js'
import { getEntry } from './diary.repo.js'
import { mirrorEntries, unmirrorEntry, type MirrorClient } from './mirror.service.js'
import type { SearchResult } from '../matching/matcher.js'

function seedFood(db: ReturnType<typeof createTestDb>, name: string, kcal: number, id = `bls:${name}`) {
  const now = Date.now()
  upsertSourcedFood(db, {
    id,
    source: 'bls',
    sourceId: id,
    name,
    kcal,
    protein: 10,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

function fakeClient(searchResults: SearchResult[] = []): MirrorClient & {
  added: { product_id: string; amount: number }[]
  removed: string[]
} {
  const added: { product_id: string; amount: number }[] = []
  const removed: string[] = []
  return {
    added,
    removed,
    user: {
      addConsumedItem: vi.fn(async (item: { product_id: string; amount: number }) => {
        added.push(item)
      }),
      removeConsumedItem: vi.fn(async (id: string) => {
        removed.push(id)
      }),
    },
    products: { search: vi.fn(async () => searchResults) },
  } as unknown as MirrorClient & { added: { product_id: string; amount: number }[]; removed: string[] }
}

async function setup(db: ReturnType<typeof createTestDb>) {
  const user = await createUser(db, `mirror-${Math.random().toString(36).slice(2, 8)}`, 'pw-123456')
  createAccount(db, user.id, 'Test', { username: 'yz@example.com', password: 'secret' })
  return user
}

describe('mirror service', () => {
  it('mirrors via a learned legacy alias', async () => {
    const db = createTestDb()
    const user = await setup(db)
    const foodId = seedFood(db, 'Banane roh', 79)
    upsertAlias(db, user.id, 'banane roh', {
      productId: 'yz-prod-1',
      defaultServing: null,
      defaultServingQuantity: null,
      defaultAmountG: 120,
    })

    const { entries } = createEntries(db, user.id, { lines: [{ foodId, amountG: 120 }] }, { queueMirror: false })
    const client = fakeClient()
    await mirrorEntries(db, user.id, entries.map((e) => e.id), () => client)

    const mirrored = getEntry(db, user.id, entries[0]!.id)!
    expect(mirrored.mirrorStatus).toBe('mirrored')
    expect(JSON.parse(mirrored.mirrorJson!)).toMatchObject({ productId: 'yz-prod-1' })
    expect(client.added[0]).toMatchObject({ product_id: 'yz-prod-1', amount: 120 })
  })

  it('skips without a confident match — never writes a guess', async () => {
    const db = createTestDb()
    const user = await setup(db)
    const foodId = seedFood(db, 'Exotische Spezialität', 100)

    // search returns something, but the name does not match exactly
    const client = fakeClient([
      {
        product_id: 'yz-wrong',
        name: 'Etwas ganz anderes',
        producer: '',
        is_verified: true,
        base_unit: 'g',
        amount: 100,
        serving: 'portion',
        serving_quantity: 1,
        nutrients: {},
      },
    ])
    const { entries } = createEntries(db, user.id, { lines: [{ foodId, amountG: 100 }] }, { queueMirror: false })
    await mirrorEntries(db, user.id, entries.map((e) => e.id), () => client)

    const row = getEntry(db, user.id, entries[0]!.id)!
    expect(row.mirrorStatus).toBe('skipped')
    expect(client.added).toHaveLength(0)
  })

  it('mirrors via an exact-name search hit', async () => {
    const db = createTestDb()
    const user = await setup(db)
    const foodId = seedFood(db, 'Banane roh', 79)
    const client = fakeClient([
      {
        product_id: 'yz-banana',
        name: 'Banane Roh',
        producer: '',
        is_verified: true,
        base_unit: 'g',
        amount: 100,
        serving: 'portion',
        serving_quantity: 1,
        nutrients: {},
      },
    ])
    const { entries } = createEntries(db, user.id, { lines: [{ foodId, amountG: 80 }] }, { queueMirror: false })
    await mirrorEntries(db, user.id, entries.map((e) => e.id), () => client)
    expect(getEntry(db, user.id, entries[0]!.id)!.mirrorStatus).toBe('mirrored')
  })

  it('marks failed when Yazio rejects the write', async () => {
    const db = createTestDb()
    const user = await setup(db)
    const foodId = seedFood(db, 'Apfel roh', 52)
    upsertAlias(db, user.id, 'apfel roh', {
      productId: 'yz-apple',
      defaultServing: null,
      defaultServingQuantity: null,
      defaultAmountG: null,
    })
    const client = fakeClient()
    vi.mocked(client.user.addConsumedItem).mockRejectedValue(new Error('yazio down'))
    const { entries } = createEntries(db, user.id, { lines: [{ foodId, amountG: 100 }] }, { queueMirror: false })
    await mirrorEntries(db, user.id, entries.map((e) => e.id), () => client)
    const row = getEntry(db, user.id, entries[0]!.id)!
    expect(row.mirrorStatus).toBe('failed')
    expect(JSON.parse(row.mirrorJson!)).toMatchObject({ error: 'yazio down' })
  })

  it('unmirror removes the consumed item on entry delete', async () => {
    const db = createTestDb()
    const user = await setup(db)
    const foodId = seedFood(db, 'Banane roh', 79)
    upsertAlias(db, user.id, 'banane roh', {
      productId: 'yz-prod-1',
      defaultServing: null,
      defaultServingQuantity: null,
      defaultAmountG: null,
    })
    const client = fakeClient()
    const { entries } = createEntries(db, user.id, { lines: [{ foodId, amountG: 100 }] }, { queueMirror: false })
    await mirrorEntries(db, user.id, entries.map((e) => e.id), () => client)
    const mirrored = getEntry(db, user.id, entries[0]!.id)!
    const { consumedId } = JSON.parse(mirrored.mirrorJson!) as { consumedId: string }

    await unmirrorEntry(db, user.id, mirrored, () => client)
    expect(client.removed).toEqual([consumedId])
  })

  it('entries stay pending=false (null) when the user has no yazio account', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'noyazio', 'pw-123456')
    const foodId = seedFood(db, 'Banane roh', 79, 'bls:b2')
    const { entries, mirrorQueued } = createEntries(db, user.id, { lines: [{ foodId, amountG: 100 }] })
    expect(mirrorQueued).toBe(false)
    expect(entries[0]!.mirrorStatus).toBeNull()
  })
})
