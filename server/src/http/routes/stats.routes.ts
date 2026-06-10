import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getStats } from '../../modules/diary/stats.service.js'

export function registerStatsRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/stats', { preHandler: requireAuth }, async (req, reply) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(7).max(90).default(7) })
      .parse(req.query)
    return reply.send(getStats(db, req.user!.id, days))
  })
}
