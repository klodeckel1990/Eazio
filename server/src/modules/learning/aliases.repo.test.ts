import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { getAlias, upsertAlias } from './aliases.repo.js'

describe('aliases repo', () => {
  it('inserts then updates (bumping hits) and is user-scoped', async () => {
    const db = createTestDb()
    const u1 = await createUser(db, 'u1', 'pw-123456')
    const u2 = await createUser(db, 'u2', 'pw-123456')

    expect(getAlias(db, u1.id, 'haferflocken')).toBeUndefined()

    upsertAlias(db, u1.id, 'haferflocken', { productId: 'p1', defaultAmountG: 80 })
    const a1 = getAlias(db, u1.id, 'haferflocken')!
    expect(a1.productId).toBe('p1')
    expect(a1.hits).toBe(1)

    upsertAlias(db, u1.id, 'haferflocken', { productId: 'p2' })
    const a2 = getAlias(db, u1.id, 'haferflocken')!
    expect(a2.productId).toBe('p2')
    expect(a2.hits).toBe(2)

    expect(getAlias(db, u2.id, 'haferflocken')).toBeUndefined()
  })
})
