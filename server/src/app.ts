import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import { env } from './config/env.js'
import type { DB } from './db/client.js'
import { getSession, getSessionByToken, SESSION_COOKIE } from './modules/auth/sessions.js'
import { registerErrorHandler } from './http/errors.js'
import { registerHealthRoutes } from './http/routes/health.routes.js'
import { registerAuthRoutes } from './http/routes/auth.routes.js'
import { registerAccountRoutes } from './http/routes/accounts.routes.js'
import { registerMatchRoutes } from './http/routes/match.routes.js'
import { registerPresetRoutes } from './http/routes/presets.routes.js'
import { registerLogRoutes } from './http/routes/log.routes.js'
import { registerRecipeRoutes } from './http/routes/recipes.routes.js'
import { registerSettingsRoutes } from './http/routes/settings.routes.js'
import { registerFoodRoutes } from './http/routes/foods.routes.js'
import { registerDiaryRoutes } from './http/routes/diary.routes.js'
import { registerGoalRoutes } from './http/routes/goals.routes.js'
import { registerWidgetRoutes } from './http/routes/widget.routes.js'
import { registerStatsRoutes } from './http/routes/stats.routes.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string } | null
  }
}

export function buildApp(db: DB, opts: { webDir?: string } = {}): FastifyInstance {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' })

  app.register(cookie, { secret: env.SESSION_SECRET })

  // Native app shells (Capacitor) and the Vite dev server hit the API
  // cross-origin; same-origin requests carry no Origin header and pass.
  const corsOrigins = new Set([
    'capacitor://localhost', // iOS Capacitor scheme
    'https://localhost', // iOS WKWebView https scheme
    'http://localhost', // Android WebView
    'http://localhost:5173', // Vite dev server
    ...(env.CORS_EXTRA_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
  ])
  app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || corsOrigins.has(origin)),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type'],
  })

  // CSP is the main XSS mitigation for the bearer token in localStorage:
  // only self-hosted scripts may run. Fonts come from Google Fonts; inline
  // style attributes are used by React components.
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    // Recipe images are embedded from the native app's origin later on.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

  app.decorateRequest('user', null)

  // Resolve a bearer token (preferred) or the session cookie into req.user.
  app.addHook('preHandler', async (req) => {
    req.user = null
    const auth = req.headers.authorization
    if (auth?.startsWith('Bearer ')) {
      const session = getSessionByToken(db, auth.slice('Bearer '.length))
      if (session) req.user = { id: session.userId }
      return
    }
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
  registerRecipeRoutes(app, db)
  registerSettingsRoutes(app, db)
  registerFoodRoutes(app, db)
  registerDiaryRoutes(app, db)
  registerGoalRoutes(app, db)
  registerWidgetRoutes(app, db)
  registerStatsRoutes(app, db)

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
