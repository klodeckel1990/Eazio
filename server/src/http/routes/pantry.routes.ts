import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import {
  addOrIncrementPantry,
  listPantry,
  removePantryItem,
  updatePantryItem,
} from '../../modules/pantry/pantry.repo.js'

const AddSchema = z.object({
  items: z
    .array(
      z.object({
        foodId: z.string().min(1),
        amountG: z.number().positive().max(100000),
        expiresAt: z.number().int().nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
})

const PatchSchema = z
  .object({
    amountG: z.number().positive().max(100000).optional(),
    expiresAt: z.number().int().nullable().optional(),
  })
  .refine((b) => b.amountG !== undefined || b.expiresAt !== undefined, { message: 'nothing to update' })

const IdParams = z.object({ id: z.string().min(1) })

// Vorratsschrank — gratis (anlegen/verwalten). Matching + Wizard kommen als
// Premium-Routen dazu (Phase 2/3).
export function registerPantryRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/pantry', { preHandler: requireAuth }, async (req) => ({ items: listPantry(db, req.user!.id) }))

  app.post('/api/pantry', { preHandler: requireAuth }, async (req, reply) => {
    const b = AddSchema.parse(req.body)
    for (const it of b.items) addOrIncrementPantry(db, req.user!.id, it.foodId, it.amountG, it.expiresAt ?? null)
    return reply.status(201).send({ items: listPantry(db, req.user!.id) })
  })

  app.patch('/api/pantry/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const patch = PatchSchema.parse(req.body)
    if (!updatePantryItem(db, req.user!.id, id, patch)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })

  app.delete('/api/pantry/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!removePantryItem(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })
}
