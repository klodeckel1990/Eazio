import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { linkAccount } from '../../modules/accounts/accounts.service.js'
import { listAccounts, setDefaultAccount, removeAccount } from '../../modules/accounts/accounts.repo.js'

const LinkSchema = z.object({
  label: z.string().min(1).max(64),
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(256),
})

const IdParams = z.object({ id: z.string().min(1) })

export function registerAccountRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/accounts', { preHandler: requireAuth }, async (req) => {
    return listAccounts(db, req.user!.id)
  })

  app.post('/api/accounts', { preHandler: requireAuth }, async (req, reply) => {
    const body = LinkSchema.parse(req.body)
    const result = await linkAccount(db, req.user!.id, body.label, {
      username: body.username,
      password: body.password,
    })
    if (!result.ok) return reply.status(400).send({ error: 'yazio_auth_failed' })
    return reply.status(201).send(result.account)
  })

  app.patch('/api/accounts/:id/default', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!setDefaultAccount(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })

  app.delete('/api/accounts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!removeAccount(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })
}
