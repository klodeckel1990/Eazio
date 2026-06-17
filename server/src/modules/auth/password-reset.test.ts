import { describe, it, expect } from 'vitest'
import { createResetToken, verifyResetToken } from './password-reset.js'

const HASH = '$argon2id$v=19$m=65536,t=3,p=4$abcdef$ghijkl'
const lookup = (id: string) => (id === 'u1' ? HASH : null)

describe('password reset token', () => {
  it('verifies a fresh, untampered token', () => {
    const t = createResetToken('u1', HASH)
    expect(verifyResetToken(t, lookup)).toBe('u1')
  })

  it('rejects an expired token', () => {
    const t = createResetToken('u1', HASH, Date.now() - 40 * 60 * 1000) // vor 40 Min → 10 Min abgelaufen
    expect(verifyResetToken(t, lookup)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const [u, e] = createResetToken('u1', HASH).split('.')
    expect(verifyResetToken(`${u}.${e}.deadbeefdeadbeef`, lookup)).toBeNull()
  })

  it('rejects after the password changed (single-use)', () => {
    const t = createResetToken('u1', HASH)
    const lookupAfterChange = (id: string) => (id === 'u1' ? 'NEW-HASH' : null)
    expect(verifyResetToken(t, lookupAfterChange)).toBeNull()
  })

  it('rejects an unknown user / malformed token', () => {
    expect(verifyResetToken(createResetToken('ghost', HASH), lookup)).toBeNull()
    expect(verifyResetToken('not-a-token', lookup)).toBeNull()
  })
})
