import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getAccount, getDefaultAccount } from '../../modules/accounts/accounts.repo.js'
import { buildYazioClient } from '../../modules/yazio/client.js'
import { matchText, searchCandidates, type SearchClient } from '../../modules/matching/matcher.js'

const MatchSchema = z.object({
  text: z.string().min(1).max(5000),
  accountId: z.string().min(1).optional(),
})

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  accountId: z.string().min(1).optional(),
})

export function registerMatchRoutes(app: FastifyInstance, db: DB): void {
  app.post('/api/match', { preHandler: requireAuth }, async (req, reply) => {
    const body = MatchSchema.parse(req.body)
    const userId = req.user!.id
    const account = body.accountId
      ? getAccount(db, userId, body.accountId)
      : getDefaultAccount(db, userId)
    if (!account) return reply.status(409).send({ error: 'no_account' })

    const client = buildYazioClient(db, account) as unknown as SearchClient
    const lines = await matchText(client, db, userId, body.text)
    return { accountId: account.id, lines }
  })

  // Re-search a single product line with a user-edited query (verbatim, no
  // normalization — the user typed it deliberately). Returns up to 10 candidates.
  app.post('/api/search', { preHandler: requireAuth }, async (req, reply) => {
    const body = SearchSchema.parse(req.body)
    const userId = req.user!.id
    const account = body.accountId
      ? getAccount(db, userId, body.accountId)
      : getDefaultAccount(db, userId)
    if (!account) return reply.status(409).send({ error: 'no_account' })

    const client = buildYazioClient(db, account) as unknown as SearchClient
    const candidates = await searchCandidates(client, body.query)
    return { accountId: account.id, candidates }
  })
}
