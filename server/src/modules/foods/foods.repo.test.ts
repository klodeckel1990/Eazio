import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import {
  createCustomFood,
  findFoodByBarcode,
  getFoodById,
  searchFoods,
  softDeleteCustomFood,
  updateCustomFood,
  upsertSourcedFood,
  type NewFood,
} from './foods.repo.js'
import { buildSearchTerms } from './search-terms.js'

function blsFood(code: string, name: string, kcal: number): NewFood {
  const now = Date.now()
  return {
    id: `bls:${code}`,
    source: 'bls',
    sourceId: code,
    name,
    searchTerms: buildSearchTerms(name),
    kcal,
    createdAt: now,
    updatedAt: now,
  }
}

describe('foods repo', () => {
  it('upserts sourced foods idempotently and bumps version', async () => {
    const db = createTestDb()
    upsertSourcedFood(db, blsFood('X1', 'Banane roh', 79))
    upsertSourcedFood(db, { ...blsFood('X1', 'Banane roh', 81) })
    const user = await createUser(db, 'u1', 'pw-123456')
    const row = getFoodById(db, 'bls:X1', user.id)
    expect(row?.kcal).toBe(81)
    expect(row?.version).toBe(2)
  })

  it('searches with umlaut variants and ranks exact base products first', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'u2', 'pw-123456')
    upsertSourcedFood(db, blsFood('M1', 'Müsli Basismischung ungesüßt', 350))
    upsertSourcedFood(db, blsFood('M2', 'Müslikekse schokoliert mit langer Bezeichnung', 438))
    upsertSourcedFood(db, blsFood('B1', 'Banane roh', 79))

    const direct = searchFoods(db, user.id, 'müsli', 10)
    const folded = searchFoods(db, user.id, 'muesli', 10)
    expect(direct.map((f) => f.id)).toEqual(folded.map((f) => f.id))
    expect(direct[0]?.name).toBe('Müsli Basismischung ungesüßt')
    expect(direct.some((f) => f.name.startsWith('Müslikekse'))).toBe(true)
    expect(direct.some((f) => f.name === 'Banane roh')).toBe(false)
  })

  it('finds split compounds via joined search terms', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'u3', 'pw-123456')
    upsertSourcedFood(db, blsFood('H1', 'Hafer Flocken', 372))
    const hits = searchFoods(db, user.id, 'haferflocken', 10)
    expect(hits.map((f) => f.name)).toContain('Hafer Flocken')
  })

  it('ranks own custom foods above bls matches', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'u4', 'pw-123456')
    upsertSourcedFood(db, blsFood('P1', 'Proteinpulver Standard', 380))
    createCustomFood(db, user.id, { name: 'Proteinpulver Vanille', kcal: 390 })
    const hits = searchFoods(db, user.id, 'proteinpulver', 10)
    expect(hits[0]?.source).toBe('custom')
  })

  it('hides foreign custom foods from search, get and barcode', async () => {
    const db = createTestDb()
    const alice = await createUser(db, 'alice', 'pw-123456')
    const bob = await createUser(db, 'bob', 'pw-123456')
    const secret = createCustomFood(db, alice.id, {
      name: 'Geheimer Shake',
      kcal: 123,
      barcode: '4000000000001',
    })

    expect(searchFoods(db, bob.id, 'geheimer', 10)).toHaveLength(0)
    expect(getFoodById(db, secret.id, bob.id)).toBeNull()
    expect(findFoodByBarcode(db, '4000000000001', bob.id)).toBeNull()

    expect(getFoodById(db, secret.id, alice.id)?.name).toBe('Geheimer Shake')
    expect(findFoodByBarcode(db, '4000000000001', alice.id)?.id).toBe(secret.id)
  })

  it('prefers the own custom entry over a cached off row for the same barcode', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'u5', 'pw-123456')
    const now = Date.now()
    upsertSourcedFood(db, {
      id: 'off:4000000000002',
      source: 'off',
      sourceId: '4000000000002',
      barcode: '4000000000002',
      name: 'Riegel (OFF)',
      kcal: 400,
      createdAt: now,
      updatedAt: now,
    })
    createCustomFood(db, user.id, { name: 'Riegel (eigen)', kcal: 410, barcode: '4000000000002' })
    expect(findFoodByBarcode(db, '4000000000002', user.id)?.name).toBe('Riegel (eigen)')
  })

  it('updates and soft-deletes only own custom foods', async () => {
    const db = createTestDb()
    const alice = await createUser(db, 'alice2', 'pw-123456')
    const bob = await createUser(db, 'bob2', 'pw-123456')
    const food = createCustomFood(db, alice.id, { name: 'Shake', kcal: 100 })

    expect(updateCustomFood(db, bob.id, food.id, { kcal: 1 })).toBeNull()
    expect(softDeleteCustomFood(db, bob.id, food.id)).toBe(false)

    const updated = updateCustomFood(db, alice.id, food.id, { name: 'Shake Deluxe', kcal: 110 })
    expect(updated?.name).toBe('Shake Deluxe')
    expect(updated?.version).toBe(2)
    // renamed food is found under the new name
    expect(searchFoods(db, alice.id, 'deluxe', 10)).toHaveLength(1)

    expect(softDeleteCustomFood(db, alice.id, food.id)).toBe(true)
    expect(getFoodById(db, food.id, alice.id)).toBeNull()
    expect(searchFoods(db, alice.id, 'shake', 10)).toHaveLength(0)
  })
})
