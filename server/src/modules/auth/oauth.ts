// ID-Token-Verifikation für "Sign in with Google/Apple". Der Client (nativ
// oder Web) holt das ID-Token direkt beim Provider; der Server prüft hier
// Signatur (Provider-JWKS), Issuer, Audience und Ablauf — erst danach wird
// die normale Bearer-Session ausgestellt. Es gibt keine Client-Secrets:
// die Client-IDs sind öffentlich und dienen nur als Audience-Allowlist.
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { env } from '../../config/env.js'

export type OAuthProvider = 'google' | 'apple'

export interface OAuthClaims {
  subject: string
  email: string | null
  emailVerified: boolean
  name: string | null
}

export type OAuthVerifier = (provider: OAuthProvider, idToken: string) => Promise<OAuthClaims>

export class OAuthNotConfiguredError extends Error {
  constructor(provider: OAuthProvider) {
    super(`${provider} sign-in is not configured`)
    this.name = 'OAuthNotConfiguredError'
  }
}

// createRemoteJWKSet lädt die Keys lazy beim ersten Verify und cached sie
// (inkl. Rotation) — kein Netzwerkzugriff beim Modul-Import.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

function toClaims(payload: JWTPayload): OAuthClaims {
  if (!payload.sub) throw new Error('id token has no subject')
  const p = payload as Record<string, unknown>
  // Apple liefert email_verified je nach Token-Version als Bool oder "true".
  const emailVerified = p.email_verified === true || p.email_verified === 'true'
  return {
    subject: payload.sub,
    email: typeof p.email === 'string' ? p.email.trim().toLowerCase() : null,
    emailVerified,
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null,
  }
}

export const verifyOAuthIdToken: OAuthVerifier = async (provider, idToken) => {
  if (provider === 'google') {
    const audience = [env.GOOGLE_WEB_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID].filter(
      (v): v is string => Boolean(v),
    )
    if (audience.length === 0) throw new OAuthNotConfiguredError('google')
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    })
    return toClaims(payload)
  }
  const audience = [env.APPLE_APP_CLIENT_ID, env.APPLE_WEB_CLIENT_ID].filter(
    (v): v is string => Boolean(v),
  )
  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: 'https://appleid.apple.com',
    audience,
  })
  return toClaims(payload)
}
