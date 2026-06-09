import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getSettings, updateSettings } from '../../modules/settings/settings.repo.js'

const PatchSchema = z.object({
  iosShortcutHintDismissed: z.boolean().optional(),
})

export function registerSettingsRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/settings', { preHandler: requireAuth }, async (req) => getSettings(db, req.user!.id))

  app.patch('/api/settings', { preHandler: requireAuth }, async (req) => {
    const body = PatchSchema.parse(req.body)
    return updateSettings(db, req.user!.id, body)
  })
}
