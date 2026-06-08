import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../db/test-db.js'
import { createUser, findUserByUsername, findUserById } from './users.repo.js'

describe('users repo', () => {
  it('creates and finds a user by username and id', async () => {
    const db = createTestDb()
    const created = await createUser(db, 'jens', 'pw-123456')
    expect(created.id).toMatch(/[0-9a-f-]{36}/)

    const byName = findUserByUsername(db, 'jens')
    expect(byName?.username).toBe('jens')
    expect(byName?.passwordHash).not.toBe('pw-123456')

    const byId = findUserById(db, created.id)
    expect(byId?.username).toBe('jens')
  })

  it('rejects a duplicate username', async () => {
    const db = createTestDb()
    await createUser(db, 'dup', 'pw-123456')
    await expect(createUser(db, 'dup', 'pw-123456')).rejects.toThrow()
  })

  it('returns undefined for a non-existent user', () => {
    const db = createTestDb()
    expect(findUserByUsername(db, 'nobody')).toBeUndefined()
    expect(findUserById(db, randomUUID())).toBeUndefined()
  })
})
