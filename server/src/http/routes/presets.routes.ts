import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { createPreset, listPresets, getPreset, deletePreset } from '../../modules/presets/presets.repo.js'

const ItemSchema = z.object({
  rawText: z.string().min(1).max(200),
  productId: z.string().min(1),
  serving: z.string().nullish(),
  servingQuantity: z.number().nullish(),
  amountG: z.number().nonnegative(),
})

const CreateSchema = z.object({
  name: z.string().min(1).max(64),
  items: z.array(ItemSchema).min(1).max(50),
})

const IdParams = z.object({ id: z.string().min(1) })

export function registerPresetRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/presets', { preHandler: requireAuth }, async (req) => listPresets(db, req.user!.id))

  app.post('/api/presets', { preHandler: requireAuth }, async (req, reply) => {
    const b = CreateSchema.parse(req.body)
    try {
      const preset = createPreset(db, req.user!.id, b.name, b.items)
      return reply.status(201).send(preset)
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        return reply.status(409).send({ error: 'name_taken' })
      }
      throw err
    }
  })

  app.get('/api/presets/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const preset = getPreset(db, req.user!.id, id)
    if (!preset) return reply.status(404).send({ error: 'not_found' })
    return preset
  })

  app.delete('/api/presets/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!deletePreset(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })
}
