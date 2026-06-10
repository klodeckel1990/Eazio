import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getWidgetSummary } from '../../modules/diary/diary.service.js'

// Compact, cheap day summary for home-screen widgets and Live Activities.
// Widgets authenticate with the same bearer token (shared keychain on iOS).
export function registerWidgetRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/widget/summary', { preHandler: requireAuth }, async (req, reply) => {
    const { date } = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .parse(req.query)
    return reply.header('cache-control', 'no-store').send(getWidgetSummary(db, req.user!.id, date))
  })
}
