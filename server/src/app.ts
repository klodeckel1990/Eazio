import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import type { DB } from './db/client.js'
import { getSession, SESSION_COOKIE } from './modules/auth/sessions.js'
import { registerErrorHandler } from './http/errors.js'
import { registerHealthRoutes } from './http/routes/health.routes.js'
import { registerAuthRoutes } from './http/routes/auth.routes.js'
import { registerAccountRoutes } from './http/routes/accounts.routes.js'
import { registerMatchRoutes } from './http/routes/match.routes.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string } | null
  }
}

export function buildApp(db: DB): FastifyInstance {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' })

  app.register(cookie, { secret: env.SESSION_SECRET })
  app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

  app.decorateRequest('user', null)

  // Resolve the session cookie into req.user for every request.
  app.addHook('preHandler', async (req) => {
    req.user = null
    const raw = req.cookies[SESSION_COOKIE]
    if (!raw) return
    const unsigned = req.unsignCookie(raw)
    if (!unsigned.valid || !unsigned.value) return
    const session = getSession(db, unsigned.value)
    if (session) req.user = { id: session.userId }
  })

  registerErrorHandler(app)
  registerHealthRoutes(app)
  registerAuthRoutes(app, db)
  registerAccountRoutes(app, db)
  registerMatchRoutes(app, db)

  return app
}
