import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyCredentials = vi.fn()
vi.mock('../yazio/client.js', () => ({ verifyCredentials: (c: unknown) => verifyCredentials(c) }))

import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { linkAccount } from './accounts.service.js'
import { listAccounts } from './accounts.repo.js'

beforeEach(() => verifyCredentials.mockReset())

describe('accounts service', () => {
  it('rejects linking when Yazio auth fails and stores nothing', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    verifyCredentials.mockResolvedValueOnce(false)
    const res = await linkAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'bad' })
    expect(res.ok).toBe(false)
    expect(listAccounts(db, user.id)).toHaveLength(0)
  })

  it('verifies then stores the account on success', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    verifyCredentials.mockResolvedValueOnce(true)
    const res = await linkAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'good' })
    expect(res.ok).toBe(true)
    expect(listAccounts(db, user.id)).toHaveLength(1)
    expect(verifyCredentials).toHaveBeenCalledOnce()
  })
})
