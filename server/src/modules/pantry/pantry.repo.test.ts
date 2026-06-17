import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import type { DB } from '../../db/client.js'
import { createUser } from '../auth/users.repo.js'
import { foods } from '../../db/schema.js'
import { addOrIncrementPantry, listPantry, removePantryItem, updatePantryItem } from './pantry.repo.js'

function seedFood(db: DB, id: string, name: string, baseUnit: 'g' | 'ml' = 'g') {
  const ts = Date.now()
  db.insert(foods).values({ id, source: 'custom', name, baseUnit, kcal: 50, version: 1, createdAt: ts, updatedAt: ts }).run()
}

describe('pantry repo', () => {
  it('adds, increments, lists, updates and removes — user-scoped', async () => {
    const db = createTestDb()
    const u1 = await createUser(db, 'p1', 'pw-123456')
    const u2 = await createUser(db, 'p2', 'pw-123456')
    seedFood(db, 'f-oats', 'Haferflocken')
    seedFood(db, 'f-milk', 'Milch', 'ml')

    addOrIncrementPantry(db, u1.id, 'f-oats', 500)
    addOrIncrementPantry(db, u1.id, 'f-oats', 200) // gleiches Food → addiert auf 700
    addOrIncrementPantry(db, u1.id, 'f-milk', 1000)

    const list = listPantry(db, u1.id)
    expect(list).toHaveLength(2)
    const oats = list.find((r) => r.foodId === 'f-oats')!
    expect(oats.amountG).toBe(700)
    expect(oats.name).toBe('Haferflocken')
    expect(list.find((r) => r.foodId === 'f-milk')!.baseUnit).toBe('ml')

    expect(listPantry(db, u2.id)).toHaveLength(0) // user-scoped

    expect(updatePantryItem(db, u1.id, oats.id, { amountG: 300, expiresAt: 123 })).toBe(true)
    const after = listPantry(db, u1.id).find((r) => r.id === oats.id)!
    expect(after.amountG).toBe(300)
    expect(after.expiresAt).toBe(123)

    // fremder Nutzer darf nicht ändern/löschen
    expect(updatePantryItem(db, u2.id, oats.id, { amountG: 1 })).toBe(false)
    expect(removePantryItem(db, u2.id, oats.id)).toBe(false)

    expect(removePantryItem(db, u1.id, oats.id)).toBe(true)
    expect(listPantry(db, u1.id)).toHaveLength(1)
  })

  it('stores expiresAt on add and keeps it when re-adding without a new date', async () => {
    const db = createTestDb()
    const u = await createUser(db, 'p3', 'pw-123456')
    seedFood(db, 'f-rice', 'Reis')

    addOrIncrementPantry(db, u.id, 'f-rice', 500, 1_900_000_000_000)
    let row = listPantry(db, u.id)[0]!
    expect(row.expiresAt).toBe(1_900_000_000_000)

    // erneut hinzufügen ohne MHD → Menge addiert, MHD bleibt (COALESCE)
    addOrIncrementPantry(db, u.id, 'f-rice', 100)
    row = listPantry(db, u.id)[0]!
    expect(row.amountG).toBe(600)
    expect(row.expiresAt).toBe(1_900_000_000_000)

    // erneut mit neuem MHD → überschreibt
    addOrIncrementPantry(db, u.id, 'f-rice', 0.0001, 2_000_000_000_000)
    expect(listPantry(db, u.id)[0]!.expiresAt).toBe(2_000_000_000_000)
  })
})
