import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createPreset, listPresets, getPreset, updatePreset, deletePreset } from './presets.repo.js'

const items = [
  { rawText: '80g Haferflocken', productId: 'p1', amountG: 80, serving: null, servingQuantity: null },
  { rawText: '200ml Milch', productId: 'p2', amountG: 200, serving: null, servingQuantity: null },
]

describe('presets repo', () => {
  it('creates a preset with items, lists, loads, and deletes (cascade), user-scoped', async () => {
    const db = createTestDb()
    const u1 = await createUser(db, 'u1', 'pw-123456')
    const u2 = await createUser(db, 'u2', 'pw-123456')

    const p = createPreset(db, u1.id, 'Mein Müsli', items)
    expect(listPresets(db, u1.id)).toEqual([{ id: p.id, name: 'Mein Müsli' }])
    expect(listPresets(db, u2.id)).toEqual([])

    const loaded = getPreset(db, u1.id, p.id)!
    expect(loaded.name).toBe('Mein Müsli')
    expect(loaded.items).toHaveLength(2)
    expect(loaded.items[0]).toMatchObject({ productId: 'p1', amountG: 80, position: 0 })

    expect(getPreset(db, u2.id, p.id)).toBeUndefined()
    expect(deletePreset(db, u2.id, p.id)).toBe(false)
    expect(deletePreset(db, u1.id, p.id)).toBe(true)
    expect(getPreset(db, u1.id, p.id)).toBeUndefined()
  })

  it('updates name and replaces items, user-scoped', async () => {
    const db = createTestDb()
    const u1 = await createUser(db, 'u1', 'pw-123456')
    const u2 = await createUser(db, 'u2', 'pw-123456')
    const p = createPreset(db, u1.id, 'Alt', items)

    // fremder Nutzer kann nicht ändern
    expect(updatePreset(db, u2.id, p.id, { name: 'Hack' })).toBeUndefined()

    const updated = updatePreset(db, u1.id, p.id, {
      name: 'Neu',
      items: [{ rawText: '1 Banane', productId: 'p9', amountG: 120, serving: null, servingQuantity: null }],
    })!
    expect(updated.name).toBe('Neu')
    expect(updated.items).toHaveLength(1)
    expect(updated.items[0]).toMatchObject({ productId: 'p9', amountG: 120, position: 0 })

    // nur Name ändern lässt Items unangetastet
    const renamed = updatePreset(db, u1.id, p.id, { name: 'Neuer Name' })!
    expect(renamed.name).toBe('Neuer Name')
    expect(renamed.items).toHaveLength(1)
  })

  it('rejects a duplicate preset name per user', async () => {
    const db = createTestDb()
    const u = await createUser(db, 'u', 'pw-123456')
    createPreset(db, u.id, 'Dup', items)
    expect(() => createPreset(db, u.id, 'Dup', items)).toThrow()
  })
})
