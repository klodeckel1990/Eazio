import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getGoals, updateGoals } from '../../modules/goals/goals.repo.js'

const GoalsSchema = z.object({
  kcalTarget: z.number().int().min(800).max(10000).optional(),
  proteinG: z.number().min(0).max(1000).nullish(),
  fatG: z.number().min(0).max(1000).nullish(),
  carbsG: z.number().min(0).max(2000).nullish(),
  waterMl: z.number().int().min(0).max(10000).optional(),
  weightKg: z.number().min(20).max(500).nullish(),
  weightGoalKg: z.number().min(20).max(500).nullish(),
})

export function registerGoalRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/goals', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send(getGoals(db, req.user!.id))
  })

  app.put('/api/goals', { preHandler: requireAuth }, async (req, reply) => {
    const patch = GoalsSchema.parse(req.body)
    return reply.send(updateGoals(db, req.user!.id, patch))
  })
}
