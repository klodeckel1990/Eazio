import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the init object the Yazio constructor receives, and let tests drive user.get().
const userGet = vi.fn()
let lastInit: any = null
// NOTE: a regular `function` (not an arrow) so the mock is constructable with
// `new` — the real Yazio is an ES6 class and MUST be invoked with `new`.
vi.mock('yazio', () => ({
  Yazio: vi.fn().mockImplementation(function (
    this: { user: { get: typeof userGet } },
    init: unknown,
  ) {
    lastInit = init
    this.user = { get: userGet }
  }),
}))

import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount, getAccount } from '../accounts/accounts.repo.js'
import { decrypt } from '../../crypto/aes.js'
import { buildYazioClient, verifyCredentials } from './client.js'
import type { YazioToken } from './types.js'

const TOKEN: YazioToken = {
  token_type: 'bearer', access_token: 'a', refresh_token: 'r',
  expires_in: 3600, expires_at: 9_999_999_999_999,
}

beforeEach(() => {
  userGet.mockReset()
  lastInit = null
})

describe('yazio client wrapper', () => {
  it('passes decrypted credentials and a token resolver that reads enc_tokens', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret' })
    const rec = getAccount(db, user.id, acc.id)!

    buildYazioClient(db, rec)
    expect(lastInit.credentials).toEqual({ username: 'me@x.de', password: 'secret' })
    expect(lastInit.token()).toBeNull()
  })

  it('persists refreshed tokens encrypted and serves them back via the resolver', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret' })
    const rec = getAccount(db, user.id, acc.id)!

    buildYazioClient(db, rec)
    lastInit.onRefresh({ token: TOKEN })

    const stored = getAccount(db, user.id, acc.id)!.encTokens!
    expect(stored).not.toContain('access_token')
    expect(JSON.parse(decrypt(stored))).toEqual(TOKEN)
    expect(lastInit.token()).toEqual(TOKEN)
  })

  it('verifyCredentials reflects user.get() success/failure', async () => {
    userGet.mockResolvedValueOnce({ id: 'x' })
    expect(await verifyCredentials({ username: 'a', password: 'b' })).toBe(true)
    userGet.mockRejectedValueOnce(new Error('401'))
    expect(await verifyCredentials({ username: 'a', password: 'b' })).toBe(false)
  })
})
