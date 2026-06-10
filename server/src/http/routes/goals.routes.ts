import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getGoals, updateGoals } from '../../modules/goals/goals.repo.js'
import { computePlan } from '../../modules/goals/plan.service.js'

const GoalsSchema = z.object({
  kcalTarget: z.number().int().min(800).max(10000).optional(),
  proteinG: z.number().min(0).max(1000).nullish(),
  fatG: z.number().min(0).max(1000).nullish(),
  carbsG: z.number().min(0).max(2000).nullish(),
  waterMl: z.number().int().min(0).max(10000).optional(),
  weightKg: z.number().min(20).max(500).nullish(),
  weightGoalKg: z.number().min(20).max(500).nullish(),
})

const OnboardingSchema = z.object({
  gender: z.enum(['female', 'male', 'diverse']),
  birthYear: z.number().int().min(1920).max(new Date().getFullYear() - 13),
  heightCm: z.number().min(120).max(250),
  weightKg: z.number().min(30).max(400),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  goalType: z.enum(['lose', 'maintain', 'gain']),
  weightGoalKg: z.number().min(30).max(400).nullish(),
  paceKgWeek: z.number().min(0.1).max(1.5).nullish(),
})

export function registerGoalRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/goals', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send(getGoals(db, req.user!.id))
  })

  app.put('/api/goals', { preHandler: requireAuth }, async (req, reply) => {
    const patch = GoalsSchema.parse(req.body)
    return reply.send(updateGoals(db, req.user!.id, patch))
  })

  // Onboarding questionnaire → computed daily plan, persisted as the user's
  // goals + profile. Re-running overwrites the plan (profile editing).
  app.post('/api/goals/onboarding', { preHandler: requireAuth }, async (req, reply) => {
    const input = OnboardingSchema.parse(req.body)
    const plan = computePlan(input)
    const goals = updateGoals(db, req.user!.id, {
      kcalTarget: plan.kcalTarget,
      proteinG: plan.proteinG,
      fatG: plan.fatG,
      carbsG: plan.carbsG,
      waterMl: plan.waterMl,
      weightKg: input.weightKg,
      weightGoalKg: input.goalType === 'maintain' ? null : (input.weightGoalKg ?? null),
      gender: input.gender,
      birthYear: input.birthYear,
      heightCm: input.heightCm,
      activityLevel: input.activityLevel,
      goalType: input.goalType,
      paceKgWeek: input.goalType === 'maintain' ? null : (input.paceKgWeek ?? null),
      onboardedAt: Date.now(),
    })
    return reply.send({ goals, plan })
  })

  // "Später" in the wizard: remember the dismissal without writing a plan
  app.post('/api/goals/onboarding/skip', { preHandler: requireAuth }, async (req, reply) => {
    return reply.send(updateGoals(db, req.user!.id, { onboardedAt: Date.now() }))
  })
}
