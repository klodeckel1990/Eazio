import type { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { createUser, findUserByUsername, findUserByEmail, findUserById } from '../../modules/auth/users.repo.js'
import { verifyPassword, dummyVerifyHash } from '../../modules/auth/password.js'
import { createSession, deleteSession, SESSION_COOKIE } from '../../modules/auth/sessions.js'

const BootstrapSchema = z.object({
  token: z.string(),
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(256),
})

const RegisterSchema = z.object({
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

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

/** Length-checked, constant-time string comparison for secret tokens. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function registerAuthRoutes(app: FastifyInstance, db: DB): void {
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
      const session = createSession(db, user.id)
      reply.setCookie(SESSION_COOKIE, session.id, { ...SESSION_COOKIE_OPTS, secure: env.COOKIE_SECURE })
      return reply.status(201).send({ id: user.id, username: user.username })
    },
  )

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = LoginSchema.parse(req.body)
      const user = findUserByUsername(db, body.username)
      // Always run argon2 (dummy hash when the user is unknown) to keep login
      // timing constant and avoid username enumeration.
      const hash = user?.passwordHash ?? (await dummyVerifyHash())
      const passwordOk = await verifyPassword(hash, body.password)
      if (!user || !passwordOk) {
        return reply.status(401).send({ error: 'invalid_credentials' })
      }
      const session = createSession(db, user.id)
      reply.setCookie(SESSION_COOKIE, session.id, {
        signed: true,
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
      return reply.status(200).send({ id: user.id, username: user.username })
    },
  )

  app.post('/api/auth/logout', async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE]
    if (raw) {
      const unsigned = req.unsignCookie(raw)
      if (unsigned.valid && unsigned.value) deleteSession(db, unsigned.value)
    }
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
    })
    return reply.status(204).send()
  })

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthenticated' })
    const user = findUserById(db, req.user.id)
    if (!user) return reply.status(401).send({ error: 'unauthenticated' })
    return reply.send({ id: user.id, username: user.username })
  })
}
