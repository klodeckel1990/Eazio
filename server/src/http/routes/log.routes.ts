import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getAccount, getDefaultAccount } from '../../modules/accounts/accounts.repo.js'
import { buildYazioClient } from '../../modules/yazio/client.js'
import { submitLog, undoLog, type LogClient } from '../../modules/logging/log.service.js'
import { getLogEvent } from '../../modules/logging/log-events.repo.js'
import { resolveDaytime, dateInTz, type Daytime } from '../../modules/meals/daytime.js'

const LineSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1).max(200),
  amountGrams: z.number().nonnegative(),
  serving: z.string().nullish(),
  servingQuantity: z.number().nullish(),
})

const LogSchema = z.object({
  accountId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  daytime: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  lines: z.array(LineSchema).min(1).max(50),
})

const IdParams = z.object({ id: z.string().min(1) })

export function registerLogRoutes(app: FastifyInstance, db: DB): void {
  app.post('/api/log', { preHandler: requireAuth }, async (req, reply) => {
    const b = LogSchema.parse(req.body)
    const userId = req.user!.id
    const account = b.accountId ? getAccount(db, userId, b.accountId) : getDefaultAccount(db, userId)
    if (!account) return reply.status(409).send({ error: 'no_account' })

    const now = new Date()
    const date = b.date ?? dateInTz(now, env.TZ)
    const daytime: Daytime = b.daytime ?? resolveDaytime(now, env.TZ)

    const client = buildYazioClient(db, account) as unknown as LogClient
    const result = await submitLog(client, db, userId, account.id, {
      date,
      daytime,
      lines: b.lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        amountGrams: l.amountGrams,
        serving: l.serving ?? null,
        servingQuantity: l.servingQuantity ?? null,
      })),
    })
    return reply.status(201).send({ logId: result.logId, count: result.count, date, daytime, accountId: account.id })
  })

  app.post('/api/log/:id/undo', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const userId = req.user!.id
    const ev = getLogEvent(db, userId, id)
    if (!ev) return reply.status(404).send({ error: 'not_found' })
    const account = getAccount(db, userId, ev.yazioAccountId)
    if (!account) return reply.status(409).send({ error: 'no_account' })
    const client = buildYazioClient(db, account) as unknown as LogClient
    const ok = await undoLog(client, db, userId, id)
    if (!ok) return reply.status(409).send({ error: 'already_undone' })
    return reply.status(204).send()
  })
}
