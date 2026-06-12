import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { deleteToken, upsertToken } from '../../modules/push/push.repo.js'

// APNs-Token sind Hex, FCM-Tokens URL-safe — großzügig validieren.
const TokenSchema = z.object({
  token: z.string().min(16).max(512),
  platform: z.enum(['ios', 'android']).default('ios'),
})

export function registerPushRoutes(app: FastifyInstance, db: DB): void {
  app.post('/api/push/register', { preHandler: requireAuth }, async (req, reply) => {
    const body = TokenSchema.parse(req.body)
    upsertToken(db, req.user!.id, body.token, body.platform)
    return reply.status(204).send()
  })

  // Beim Logout ruft der Client das auf, damit das Gerät keine Pushes des
  // alten Kontos mehr bekommt.
  app.post('/api/push/unregister', { preHandler: requireAuth }, async (req, reply) => {
    const body = TokenSchema.parse(req.body)
    deleteToken(db, body.token)
    return reply.status(204).send()
  })
}
