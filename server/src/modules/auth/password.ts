import argon2 from 'argon2'

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

let cachedDummyHash: Promise<string> | null = null

/**
 * Lazily-computed, cached argon2 hash of a fixed dummy value. Verifying a
 * supplied password against it when the user is not found equalizes login
 * timing and prevents username enumeration via response latency.
 */
export function dummyVerifyHash(): Promise<string> {
  cachedDummyHash ??= hashPassword('__eazio_timing_dummy__')
  return cachedDummyHash
}
