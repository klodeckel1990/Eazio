import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from './aes.js'

describe('aes-256-gcm', () => {
  it('round-trips a string', () => {
    const plain = JSON.stringify({ username: 'a@b.c', password: 'p@ss' })
    const enc = encrypt(plain)
    expect(enc).not.toContain('p@ss')
    expect(decrypt(enc)).toBe(plain)
  })

  it('produces different ciphertext each call (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'))
  })

  it('throws on tampered ciphertext', () => {
    const enc = encrypt('secret')
    const buf = Buffer.from(enc, 'base64')
    // Non-null assertion: buf is a non-empty Buffer so the last byte always exists.
    // noUncheckedIndexedAccess requires the assertion to satisfy the type checker.
    buf[buf.length - 1] = (buf[buf.length - 1]! ^ 0xff)
    expect(() => decrypt(buf.toString('base64'))).toThrow()
  })
})
