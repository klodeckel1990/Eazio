// Verknüpft ein verifiziertes Provider-Token mit einem lokalen Konto:
// 1. bekannte Identität (provider, sub) → deren User
// 2. sonst: verifizierte E-Mail matcht ein bestehendes Konto → verknüpfen
// 3. sonst: neues Konto anlegen (passwordHash '' = kein Passwort-Login)
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { authIdentities, users } from '../../db/schema.js'
import type { OAuthClaims, OAuthProvider } from './oauth.js'
import { findUserByEmail, findUserByUsername, type PublicUser } from './users.repo.js'

// Vorschlag aus Anzeigename oder E-Mail-Localpart; nur [a-z0-9._-], min. 3
// Zeichen (RegisterSchema-Konvention), Umlaute/Diakritika werden gefaltet.
function usernameBase(displayName: string | null, email: string | null): string {
  const source = displayName ?? email?.split('@')[0] ?? ''
  const slug = source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32)
  return slug.length >= 3 ? slug : 'tellerwert'
}

function uniqueUsername(db: DB, base: string): string {
  if (!findUserByUsername(db, base)) return base
  for (let i = 2; i <= 50; i++) {
    const candidate = `${base}-${i}`
    if (!findUserByUsername(db, candidate)) return candidate
  }
  return `${base}-${randomUUID().slice(0, 8)}`
}

function linkIdentity(db: DB, userId: string, provider: OAuthProvider, claims: OAuthClaims): void {
  db.insert(authIdentities)
    .values({
      id: randomUUID(),
      userId,
      provider,
      subject: claims.subject,
      email: claims.email,
      createdAt: Date.now(),
    })
    .run()
}

export function resolveOAuthUser(
  db: DB,
  provider: OAuthProvider,
  claims: OAuthClaims,
  // Apple liefert den Namen nur bei der allerersten Autorisierung und nur an
  // den Client — der reicht ihn deshalb separat mit durch.
  displayName: string | null = null,
): PublicUser {
  const identity = db
    .select()
    .from(authIdentities)
    .where(and(eq(authIdentities.provider, provider), eq(authIdentities.subject, claims.subject)))
    .get()
  if (identity) {
    const user = db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, identity.userId))
      .get()
    if (user) return user
    // verwaiste Identität (User existiert nicht mehr) — aufräumen, neu anlegen
    db.delete(authIdentities).where(eq(authIdentities.id, identity.id)).run()
  }

  // Nur eine vom Provider verifizierte E-Mail darf ein bestehendes Konto
  // übernehmen — sonst könnte sich jemand mit fremder E-Mail Zugriff holen.
  if (claims.email && claims.emailVerified) {
    const existing = findUserByEmail(db, claims.email)
    if (existing) {
      linkIdentity(db, existing.id, provider, claims)
      return { id: existing.id, username: existing.username }
    }
  }

  const username = uniqueUsername(db, usernameBase(displayName ?? claims.name, claims.email))
  const email = claims.email && claims.emailVerified ? claims.email : null
  const id = randomUUID()
  db.insert(users).values({ id, username, email, passwordHash: '', createdAt: Date.now() }).run()
  linkIdentity(db, id, provider, claims)
  return { id, username }
}
