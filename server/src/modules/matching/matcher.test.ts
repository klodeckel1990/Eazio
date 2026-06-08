import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { upsertAlias } from '../learning/aliases.repo.js'
import { matchText, type SearchClient } from './matcher.js'

function product(id: string, name: string, extra: Partial<Record<string, number>> = {}) {
  return {
    product_id: id, name, producer: 'ACME', is_verified: true,
    base_unit: 'g', amount: 100, serving: 'portion', serving_quantity: 1,
    nutrients: {
      'energy.energy': extra.energy ?? 350, 'nutrient.carb': 60,
      'nutrient.protein': 12, 'nutrient.fat': 7,
    },
  }
}

function clientReturning(results: ReturnType<typeof product>[]): SearchClient {
  return { products: { search: vi.fn().mockResolvedValue(results) } }
}

describe('matchText', () => {
  it('parses, searches, and maps top-10 candidates with grams for g units', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    const client = clientReturning([product('p1', 'Haferflocken'), product('p2', 'Haferflocken Bio')])

    const lines = await matchText(client, db, user.id, '80g Haferflocken')
    expect(lines).toHaveLength(1)
    const l = lines[0]!
    expect(l.unit).toBe('g')
    expect(l.amountGrams).toBe(80)
    expect(l.candidates).toHaveLength(2)
    expect(l.candidates[0]).toMatchObject({
      productId: 'p1', baseUnit: 'g', referenceAmount: 100,
      nutrientsPerReference: { kcal: 350, carb: 60, protein: 12, fat: 7 },
    })
    expect(l.selectedProductId).toBe('p1')
  })

  it('preselects and fronts a learned alias product', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    upsertAlias(db, user.id, 'haferflocken', { productId: 'p2' })
    const client = clientReturning([product('p1', 'Haferflocken'), product('p2', 'Haferflocken Bio')])

    const lines = await matchText(client, db, user.id, 'Haferflocken')
    const l = lines[0]!
    expect(l.selectedProductId).toBe('p2')
    expect(l.candidates[0]!.productId).toBe('p2')
  })

  it('marks serving units with null grams', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    const lines = await matchText(clientReturning([product('p1', 'Banane')]), db, user.id, '1 Banane')
    expect(lines[0]!.unit).toBe('serving')
    expect(lines[0]!.amountGrams).toBeNull()
  })
})
