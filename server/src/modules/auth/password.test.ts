import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash).not.toContain('correct horse')
    expect(await verifyPassword(hash, 'correct horse')).toBe(true)
    expect(await verifyPassword(hash, 'wrong')).toBe(false)
  })

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false)
  })

  it('produces a different hash each call (random salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })
})
