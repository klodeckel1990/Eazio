import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import { env } from './config/env.js'
import type { DB } from './db/client.js'
import { getSession, SESSION_COOKIE } from './modules/auth/sessions.js'
import { registerErrorHandler } from './http/errors.js'
import { registerHealthRoutes } from './http/routes/health.routes.js'
import { registerAuthRoutes } from './http/routes/auth.routes.js'
import { registerAccountRoutes } from './http/routes/accounts.routes.js'
import { registerMatchRoutes } from './http/routes/match.routes.js'
import { registerPresetRoutes } from './http/routes/presets.routes.js'
import { registerLogRoutes } from './http/routes/log.routes.js'
import { registerRecipeRoutes } from './http/routes/recipes.routes.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string } | null
  }
}

export function buildApp(db: DB, opts: { webDir?: string } = {}): FastifyInstance {
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
  registerPresetRoutes(app, db)
  registerLogRoutes(app, db)
  registerRecipeRoutes(app)

  const webDir =
    opts.webDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist')
  if (existsSync(webDir)) {
    void app.register(fastifyStatic, { root: webDir, wildcard: false })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not_found' })
      return reply.sendFile('index.html')
    })
  }

  return app
}
