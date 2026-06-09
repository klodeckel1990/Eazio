import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getFood, lookupBarcode, matchFoodText, search } from '../../modules/foods/foods.service.js'
import {
  createCustomFood,
  softDeleteCustomFood,
  updateCustomFood,
} from '../../modules/foods/foods.repo.js'
import { toDetail } from '../../modules/foods/foods.service.js'
import { OffUnavailableError } from '../../modules/foods/off.client.js'

const SearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const EanSchema = z.object({ ean: z.string().regex(/^\d{8}$|^\d{13}$/, 'ean must be 8 or 13 digits') })

const ServingSchema = z.object({
  label: z.string().trim().min(1).max(40),
  grams: z.number().positive().max(5000),
})

const CustomFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(80).nullish(),
  barcode: z.string().regex(/^\d{8}$|^\d{13}$/).nullish(),
  baseUnit: z.enum(['g', 'ml']).optional(),
  kcal: z.number().min(0).max(1000),
  protein: z.number().min(0).max(100).nullish(),
  fat: z.number().min(0).max(100).nullish(),
  saturatedFat: z.number().min(0).max(100).nullish(),
  carbs: z.number().min(0).max(100).nullish(),
  sugar: z.number().min(0).max(100).nullish(),
  fiber: z.number().min(0).max(100).nullish(),
  salt: z.number().min(0).max(100).nullish(),
  servings: z.array(ServingSchema).max(6).optional(),
})

export function registerFoodRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/foods/search', { preHandler: requireAuth }, async (req, reply) => {
    const { q, limit } = SearchSchema.parse(req.query)
    return reply.send({ results: search(db, req.user!.id, q, limit) })
  })

  // Bulk text matching for the tracker (multi-line paste → candidates per line).
  app.post('/api/foods/match', { preHandler: requireAuth }, async (req, reply) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body)
    return reply.send({ lines: matchFoodText(db, req.user!.id, text) })
  })

  app.get(
    '/api/foods/barcode/:ean',
    { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { ean } = EanSchema.parse(req.params)
      try {
        const food = await lookupBarcode(db, req.user!.id, ean)
        if (!food) return reply.status(404).send({ error: 'not_found' })
        return reply.send(food)
      } catch (err) {
        if (err instanceof OffUnavailableError) {
          return reply.status(503).send({ error: 'off_unavailable' })
        }
        throw err
      }
    },
  )

  app.get('/api/foods/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const food = getFood(db, req.user!.id, id)
    if (!food) return reply.status(404).send({ error: 'not_found' })
    return reply.send(food)
  })

  app.post('/api/foods', { preHandler: requireAuth }, async (req, reply) => {
    const body = CustomFoodSchema.parse(req.body)
    const row = createCustomFood(db, req.user!.id, body)
    return reply.status(201).send(toDetail(row, req.user!.id))
  })

  app.patch('/api/foods/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const patch = CustomFoodSchema.partial().parse(req.body)
    const row = updateCustomFood(db, req.user!.id, id, patch)
    if (!row) return reply.status(404).send({ error: 'not_found' })
    return reply.send(toDetail(row, req.user!.id))
  })

  app.delete('/api/foods/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    if (!softDeleteCustomFood(db, req.user!.id, id)) {
      return reply.status(404).send({ error: 'not_found' })
    }
    return reply.status(204).send()
  })
}
