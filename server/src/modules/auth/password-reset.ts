import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'

// Stateless Reset-Token: `${userId}.${exp}.${sig}`. Die Signatur bindet den
// aktuellen Passwort-Hash mit ein → sobald das Passwort (neu) gesetzt wird,
// werden alle alten Token ungültig (automatisch einmalig). 30 Min Gültigkeit.
// Kein DB-Eintrag nötig. userId (UUID) und der base64url-sig enthalten keine
// Punkte, exp ist eine Zahl — Split auf '.' ist also eindeutig.
const TTL_MS = 30 * 60 * 1000

function sign(userId: string, exp: number, passwordHash: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(`${userId}.${exp}.${passwordHash}`).digest('base64url')
}

export function createResetToken(userId: string, passwordHash: string, now = Date.now()): string {
  const exp = now + TTL_MS
  return `${userId}.${exp}.${sign(userId, exp, passwordHash)}`
}

/** Gibt die userId zurück, wenn das Token gültig (Signatur ok, nicht abgelaufen,
 *  Passwort-Hash unverändert) ist — sonst null. `lookup` liefert den aktuellen
 *  Passwort-Hash zur userId (null wenn unbekannt / kein Passwort). */
export function verifyResetToken(
  token: string,
  lookup: (userId: string) => string | null,
  now = Date.now(),
): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expStr, providedSig] = parts as [string, string, string]
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < now) return null
  const passwordHash = lookup(userId)
  if (!passwordHash) return null
  const expected = sign(userId, exp, passwordHash)
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return userId
}
