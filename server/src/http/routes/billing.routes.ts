import type { FastifyInstance } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { findUserById } from '../../modules/auth/users.repo.js'
import { getEntitlement, isPremium, setEntitlement } from '../../modules/billing/entitlements.js'
import { parseRcEvent } from '../../modules/billing/revenuecat.js'

const WebhookSchema = z.object({
  event: z
    .object({
      type: z.string(),
      app_user_id: z.string().nullish(),
      original_app_user_id: z.string().nullish(),
      product_id: z.string().nullish(),
      expiration_at_ms: z.number().nullish(),
      purchased_at_ms: z.number().nullish(),
      store: z.string().nullish(),
    })
    .passthrough(),
})

function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function registerBillingRoutes(app: FastifyInstance, db: DB): void {
  // RevenueCat → Server. Authentifiziert per Shared Secret im Authorization-
  // Header (in RevenueCat als "Authorization header value" hinterlegt). Einziger
  // Schreibweg fürs Entitlement.
  app.post(
    '/api/billing/revenuecat/webhook',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const secret = env.REVENUECAT_WEBHOOK_SECRET
      const auth = req.headers.authorization ?? ''
      if (!secret || !timingSafeStringEqual(auth, secret)) {
        return reply.status(401).send({ error: 'unauthorized' })
      }
      const body = WebhookSchema.parse(req.body)
      const parsed = parseRcEvent(body.event as Parameters<typeof parseRcEvent>[0])
      // 200 auch bei irrelevanten/nicht zuordenbaren Events — RC soll nicht retryen.
      if (!parsed) return reply.status(200).send({ ok: true, applied: false })
      // app_user_id muss ein echtes Konto sein (= unsere users.id via logIn()).
      if (!findUserById(db, parsed.appUserId)) {
        req.log.info({ appUserId: parsed.appUserId, type: body.event.type }, 'rc webhook: unknown user')
        return reply.status(200).send({ ok: true, applied: false })
      }
      setEntitlement(db, parsed.appUserId, parsed.update)
      return reply.status(200).send({ ok: true, applied: true })
    },
  )

  // Aktueller Entitlement-Status fürs UI (server-autoritativ).
  app.get('/api/billing/status', { preHandler: requireAuth }, async (req, reply) => {
    const ent = getEntitlement(db, req.user!.id)
    return reply.send({ premium: isPremium(db, req.user!.id), ...ent })
  })
}
