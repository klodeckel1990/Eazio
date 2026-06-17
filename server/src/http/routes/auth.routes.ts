import type { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { createUser, findUserByUsername, findUserByEmail, findUserById, getPasswordHash, setUserPassword } from '../../modules/auth/users.repo.js'
import { verifyPassword, dummyVerifyHash } from '../../modules/auth/password.js'
import { createResetToken } from '../../modules/auth/password-reset.js'
import { sendMail } from '../../modules/mail/resend.js'
import {
  createBearerSession,
  deleteSession,
  deleteSessionByToken,
  deleteUserSession,
  listUserSessions,
  SESSION_COOKIE,
} from '../../modules/auth/sessions.js'
import {
  OAuthNotConfiguredError,
  verifyOAuthIdToken,
  type OAuthVerifier,
} from '../../modules/auth/oauth.js'
import { resolveOAuthUser } from '../../modules/auth/oauth-account.js'
import { deleteUserAccount } from '../../modules/auth/delete-account.service.js'
import { getEntitlement, isPremium } from '../../modules/billing/entitlements.js'
import { requireAuth } from '../auth-guard.js'

const BootstrapSchema = z.object({
  token: z.string(),
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(256),
})

// Optional client self-description, shown in the device/session list.
const DeviceSchema = z.object({
  deviceName: z.string().trim().min(1).max(64).optional(),
  platform: z.enum(['web', 'ios', 'android']).optional(),
})

const RegisterSchema = DeviceSchema.extend({
  username: z.string().trim().min(3).max(64),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(256),
})

const SESSION_COOKIE_OPTS = {
  signed: true as const,
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
}

const LoginSchema = DeviceSchema.extend({
  username: z.string().min(1),
  password: z.string().min(1),
})

const OAuthSchema = DeviceSchema.extend({
  idToken: z.string().min(10),
  // Apple liefert den Anzeigenamen nur bei der allerersten Autorisierung und
  // nur an den Client — er kommt deshalb separat mit (nie im ID-Token).
  name: z.string().trim().min(1).max(120).optional(),
})

/** Length-checked, constant-time string comparison for secret tokens. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function registerAuthRoutes(
  app: FastifyInstance,
  db: DB,
  opts: { verifyOAuth?: OAuthVerifier } = {},
): void {
  const verifyOAuth = opts.verifyOAuth ?? verifyOAuthIdToken

  app.post(
    '/api/auth/bootstrap',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = BootstrapSchema.parse(req.body)
      if (!timingSafeStringEqual(body.token, env.ADMIN_BOOTSTRAP)) {
        return reply.status(403).send({ error: 'forbidden' })
      }
      if (findUserByUsername(db, body.username)) {
        return reply.status(409).send({ error: 'username_taken' })
      }
      const user = await createUser(db, body.username, body.password)
      return reply.status(201).send(user)
    },
  )

  // Open self-service registration. Creates the account and logs in directly.
  app.post(
    '/api/auth/register',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const body = RegisterSchema.parse(req.body)
      if (findUserByUsername(db, body.username)) {
        return reply.status(409).send({ error: 'username_taken' })
      }
      if (findUserByEmail(db, body.email)) {
        return reply.status(409).send({ error: 'email_taken' })
      }
      const user = await createUser(db, body.username, body.password, body.email)
      // One session row, reachable both ways: the id backs the (transitional)
      // cookie, the token backs Authorization: Bearer. Logout revokes both.
      const { token, session } = createBearerSession(db, user.id, body)
      reply.setCookie(SESSION_COOKIE, session.id, { ...SESSION_COOKIE_OPTS, secure: env.COOKIE_SECURE })
      return reply.status(201).send({ id: user.id, username: user.username, token })
    },
  )

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = LoginSchema.parse(req.body)
      const user = findUserByUsername(db, body.username)
      // Always run argon2 (dummy hash when the user is unknown) to keep login
      // timing constant and avoid username enumeration. '' = social-login-only
      // account → same dummy path, password login always fails.
      const hash = user?.passwordHash || (await dummyVerifyHash())
      const passwordOk = await verifyPassword(hash, body.password)
      if (!user || !passwordOk) {
        return reply.status(401).send({ error: 'invalid_credentials' })
      }
      const { token, session } = createBearerSession(db, user.id, body)
      reply.setCookie(SESSION_COOKIE, session.id, { ...SESSION_COOKIE_OPTS, secure: env.COOKIE_SECURE })
      return reply.status(200).send({ id: user.id, username: user.username, token })
    },
  )

  // Öffentlich: welche Social-Provider die Clients anbieten sollen, inkl.
  // Client-IDs (öffentliche Werte, keine Secrets). Natives "Sign in with
  // Apple" braucht keine ID — dort entscheidet der Client über die Plattform.
  app.get('/api/auth/oauth/config', async (_req, reply) => {
    return reply.send({
      google:
        env.GOOGLE_WEB_CLIENT_ID || env.GOOGLE_IOS_CLIENT_ID
          ? {
              webClientId: env.GOOGLE_WEB_CLIENT_ID ?? null,
              iosClientId: env.GOOGLE_IOS_CLIENT_ID ?? null,
            }
          : null,
      apple: { webClientId: env.APPLE_WEB_CLIENT_ID ?? null },
    })
  })

  // Social Sign-In: Client liefert das ID-Token des Providers, der Server
  // verifiziert es (JWKS/Issuer/Audience) und stellt die normale Session aus.
  app.post(
    '/api/auth/oauth/:provider',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { provider } = z
        .object({ provider: z.enum(['google', 'apple']) })
        .parse(req.params)
      const body = OAuthSchema.parse(req.body)
      let claims
      try {
        claims = await verifyOAuth(provider, body.idToken)
      } catch (err) {
        if (err instanceof OAuthNotConfiguredError) {
          return reply.status(503).send({ error: 'provider_not_configured' })
        }
        req.log.info({ err, provider }, 'oauth id token rejected')
        return reply.status(401).send({ error: 'invalid_token' })
      }
      const user = resolveOAuthUser(db, provider, claims, body.name ?? null)
      const { token, session } = createBearerSession(db, user.id, body)
      reply.setCookie(SESSION_COOKIE, session.id, { ...SESSION_COOKIE_OPTS, secure: env.COOKIE_SECURE })
      return reply.status(200).send({ id: user.id, username: user.username, token })
    },
  )

  app.post('/api/auth/logout', async (req, reply) => {
    const auth = req.headers.authorization
    if (auth?.startsWith('Bearer ')) {
      deleteSessionByToken(db, auth.slice('Bearer '.length))
    } else {
      const raw = req.cookies[SESSION_COOKIE]
      if (raw) {
        const unsigned = req.unsignCookie(raw)
        if (unsigned.valid && unsigned.value) deleteSession(db, unsigned.value)
      }
    }
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
    })
    return reply.status(204).send()
  })

  // Device/session management — the basis for "angemeldete Geräte" in settings
  // and for revoking a lost phone remotely.
  app.get('/api/auth/sessions', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send(listUserSessions(db, req.user!.id))
  })

  app.delete('/api/auth/sessions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    if (!deleteUserSession(db, req.user!.id, id)) {
      return reply.status(404).send({ error: 'not_found' })
    }
    return reply.status(204).send()
  })

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthenticated' })
    const user = findUserById(db, req.user.id)
    if (!user) return reply.status(401).send({ error: 'unauthenticated' })
    const ent = getEntitlement(db, user.id)
    return reply.send({
      id: user.id,
      username: user.username,
      premium: isPremium(db, user.id),
      premiumUntil: ent.premiumUntil,
      hasPassword: getPasswordHash(db, user.id) != null,
    })
  })

  // Passwort ändern (eingeloggt): aktuelles prüfen → neues setzen. Social-only-
  // Konten (ohne Passwort) scheitern an der konstanten Dummy-Verifikation.
  app.patch(
    '/api/auth/password',
    { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = z
        .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(256) })
        .parse(req.body)
      const stored = getPasswordHash(db, req.user!.id)
      const hash = stored || (await dummyVerifyHash())
      const ok = await verifyPassword(hash, body.currentPassword)
      if (!stored || !ok) return reply.status(401).send({ error: 'invalid_password' })
      await setUserPassword(db, req.user!.id, body.newPassword)
      return reply.status(204).send()
    },
  )

  // Passwort vergessen: schickt (falls ein Passwort-Konto mit der E-Mail
  // existiert) einen Reset-Link per Mail. Antwortet IMMER 200 → keine
  // Existenz-Preisgabe. Eng rate-limited.
  app.post(
    '/api/auth/password/forgot',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(req.body)
      const user = findUserByEmail(db, email)
      const hash = user ? getPasswordHash(db, user.id) : null
      if (user && hash) {
        const token = createResetToken(user.id, hash)
        const link = `${env.PUBLIC_BASE_URL}/passwort-zuruecksetzen?token=${encodeURIComponent(token)}`
        const html = `<!doctype html><div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2b28;max-width:520px">
<h2 style="font-family:Georgia,serif">Passwort zurücksetzen</h2>
<p>Du hast für dein Tellerwert-Konto <strong>${user.username}</strong> ein neues Passwort angefordert. Der Link ist 30 Minuten gültig:</p>
<p><a href="${link}" style="display:inline-block;background:#1f5640;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px">Neues Passwort setzen</a></p>
<p style="color:#7a766c;font-size:13px">Falls du das nicht warst, ignoriere diese Mail einfach — dein Passwort bleibt unverändert.</p>
</div>`
        const text = `Passwort für ${user.username} zurücksetzen (30 Min gültig):\n${link}\n\nNicht angefordert? Dann einfach ignorieren.`
        // Versand nicht den Request blockieren lassen (gleiche Antwortzeit egal ob Konto existiert).
        setImmediate(() => {
          sendMail({ to: email, subject: 'Tellerwert – Passwort zurücksetzen', html, text }).catch(() => {})
        })
      }
      return reply.send({ ok: true })
    },
  )

  // Konto endgültig löschen (DSGVO / App-Store-Pflicht): entfernt den Nutzer und
  // alle zugehörigen Daten, beendet jede Session und löscht das Session-Cookie.
  app.delete('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    deleteUserAccount(db, req.user!.id)
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
    })
    return reply.status(204).send()
  })
}
