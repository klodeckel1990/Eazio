import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'

/**
 * Deterministic, unguessable per-recipe token. The public recipe page
 * (schema.org/Recipe JSON-LD, consumed by the Bring! importer which fetches
 * the URL server-side) is reachable without a session as long as the caller
 * presents this token — derived via HMAC from the server secret, so it can be
 * recomputed on demand without storing anything extra in the DB.
 */
export function recipeShareToken(id: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(`recipe-share:${id}`).digest('base64url').slice(0, 22)
}

export function verifyShareToken(id: string, token: string): boolean {
  const expected = recipeShareToken(id)
  if (token.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}
