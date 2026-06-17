import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getSettings, updateSettings } from '../../modules/settings/settings.repo.js'

const PatchSchema = z.object({
  shoppingListFormat: z.enum(['plain', 'checklist', 'bring']).optional(),
  onboardingDone: z.boolean().optional(),
  activityBudget: z.boolean().optional(),
  reminderPush: z.boolean().optional(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  mealReminders: z.boolean().optional(),
  waterReminders: z.boolean().optional(),
})

export function registerSettingsRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/settings', { preHandler: requireAuth }, async (req) => getSettings(db, req.user!.id))

  app.patch('/api/settings', { preHandler: requireAuth }, async (req) => {
    const body = PatchSchema.parse(req.body)
    return updateSettings(db, req.user!.id, body)
  })
}
