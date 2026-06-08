import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import {
  createAccount, listAccounts, getAccount, getDefaultAccount,
  setDefaultAccount, removeAccount, getCredentials, updateTokens,
} from './accounts.repo.js'

async function seedUser(db: ReturnType<typeof createTestDb>) {
  return createUser(db, 'jens', 'pw-123456')
}

describe('accounts repo', () => {
  it('creates the first account as default and never returns secrets in summaries', async () => {
    const db = createTestDb()
    const user = await seedUser(db)
    const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret-pw' })
    expect(acc.isDefault).toBe(true)
    expect(acc).not.toHaveProperty('encCredentials')

    const list = listAccounts(db, user.id)
    expect(list).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain('secret-pw')

    const rec = getAccount(db, user.id, acc.id)
    expect(getCredentials(rec!)).toEqual({ username: 'me@x.de', password: 'secret-pw' })
  })

  it('keeps exactly one default and promotes on delete', async () => {
    const db = createTestDb()
    const user = await seedUser(db)
    const a = createAccount(db, user.id, 'A', { username: 'a', password: 'pa' })
    const b = createAccount(db, user.id, 'B', { username: 'b', password: 'pb' })
    expect(a.isDefault).toBe(true)
    expect(b.isDefault).toBe(false)
    expect(getAccount(db, user.id, b.id)?.isDefault).toBe(false)

    expect(setDefaultAccount(db, user.id, b.id)).toBe(true)
    expect(getDefaultAccount(db, user.id)?.id).toBe(b.id)
    expect(listAccounts(db, user.id).filter((x) => x.isDefault)).toHaveLength(1)

    expect(removeAccount(db, user.id, b.id)).toBe(true)
    expect(getDefaultAccount(db, user.id)?.id).toBe(a.id)
  })

  it('scopes access by user and round-trips tokens', async () => {
    const db = createTestDb()
    const u1 = await createUser(db, 'u1', 'pw-123456')
    const u2 = await createUser(db, 'u2', 'pw-123456')
    const a = createAccount(db, u1.id, 'A', { username: 'a', password: 'pa' })
    expect(getAccount(db, u2.id, a.id)).toBeUndefined()
    expect(setDefaultAccount(db, u2.id, a.id)).toBe(false)
    expect(removeAccount(db, u2.id, a.id)).toBe(false)

    updateTokens(db, u1.id, a.id, 'enc-token-blob')
    expect(getAccount(db, u1.id, a.id)?.encTokens).toBe('enc-token-blob')
    // a cross-user updateTokens must not modify u1's account
    updateTokens(db, u2.id, a.id, 'hacked')
    expect(getAccount(db, u1.id, a.id)?.encTokens).toBe('enc-token-blob')
  })
})
