import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../auth-guard.js'
import { dateInTz } from '../../modules/meals/daytime.js'
import { upsertActivityDay } from '../../modules/activity/activity.repo.js'
import { updateGoals } from '../../modules/goals/goals.repo.js'

const PutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  steps: z.number().int().min(0).max(200000).nullish(),
  activeKcal: z.number().min(0).max(20000).nullish(),
  weightKg: z.number().min(20).max(500).nullish(),
})

export function registerActivityRoutes(app: FastifyInstance, db: DB): void {
  // Apple Health / Health Connect sync from the native app: today's steps and
  // active energy plus the latest (smart-scale) weight. A fresh weight also
  // updates the profile so plan math and stats stay current.
  app.put('/api/activity/day', { preHandler: requireAuth }, async (req, reply) => {
    const body = PutSchema.parse(req.body)
    const date = body.date ?? dateInTz(new Date(), env.TZ)
    const activity = upsertActivityDay(db, req.user!.id, date, {
      steps: body.steps,
      activeKcal: body.activeKcal,
      weightKg: body.weightKg,
    })
    let goals = null
    if (typeof body.weightKg === 'number') {
      goals = updateGoals(db, req.user!.id, { weightKg: body.weightKg })
    }
    return reply.send({ activity, goals })
  })
}
