import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import {
  createEntries,
  deleteEntry,
  FoodNotFoundError,
  getDay,
  updateEntry,
} from '../../modules/diary/diary.service.js'
import { addWater, deleteWater, monthKcalByDay } from '../../modules/diary/diary.repo.js'
import { dateInTz } from '../../modules/meals/daytime.js'
import { getGoals } from '../../modules/goals/goals.repo.js'
import { env } from '../../config/env.js'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const DaytimeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])

// A line either references a food (snapshot computed server-side) or is
// free-form with explicit name + kcal for the given amount.
const LineSchema = z
  .object({
    foodId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    kcal: z.number().min(0).max(20000).optional(),
    protein: z.number().min(0).max(2000).nullish(),
    fat: z.number().min(0).max(2000).nullish(),
    carbs: z.number().min(0).max(2000).nullish(),
    sugar: z.number().min(0).max(2000).nullish(),
    fiber: z.number().min(0).max(2000).nullish(),
    amountG: z.number().positive().max(20000),
    servingLabel: z.string().trim().max(60).nullish(),
    servingQuantity: z.number().positive().nullish(),
    rawText: z.string().trim().max(200).optional(),
  })
  .refine((l) => l.foodId !== undefined || (l.name !== undefined && l.kcal !== undefined), {
    message: 'either foodId or name+kcal is required',
  })

const CreateSchema = z.object({
  date: DateSchema.optional(),
  daytime: DaytimeSchema.optional(),
  origin: z.enum(['manual', 'recipe', 'preset', 'photo']).optional(),
  originRefId: z.string().max(100).nullish(),
  lines: z.array(LineSchema).min(1).max(50),
})

const PatchSchema = z.object({
  amountG: z.number().positive().max(20000).optional(),
  daytime: DaytimeSchema.optional(),
  date: DateSchema.optional(),
})

const IdParams = z.object({ id: z.string().min(1) })

export function registerDiaryRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/diary', { preHandler: requireAuth }, async (req, reply) => {
    const { date } = z.object({ date: DateSchema.optional() }).parse(req.query)
    return reply.send(getDay(db, req.user!.id, date))
  })

  // calendar overview: kcal per logged day of a month + the current target
  app.get('/api/diary/month', { preHandler: requireAuth }, async (req, reply) => {
    const { month } = z
      .object({ month: z.string().regex(/^\d{4}-\d{2}$/) })
      .parse(req.query)
    return reply.send({
      month,
      kcalTarget: getGoals(db, req.user!.id).kcalTarget,
      days: monthKcalByDay(db, req.user!.id, month),
    })
  })

  app.post('/api/diary/entries', { preHandler: requireAuth }, async (req, reply) => {
    const body = CreateSchema.parse(req.body)
    try {
      const result = createEntries(db, req.user!.id, body)
      return reply.status(201).send(result)
    } catch (err) {
      if (err instanceof FoodNotFoundError) {
        return reply.status(400).send({ error: 'food_not_found' })
      }
      throw err
    }
  })

  app.patch('/api/diary/entries/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const patch = PatchSchema.parse(req.body)
    const entry = updateEntry(db, req.user!.id, id, patch)
    if (!entry) return reply.status(404).send({ error: 'not_found' })
    return reply.send(entry)
  })

  app.delete('/api/diary/entries/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!deleteEntry(db, req.user!.id, id)) {
      return reply.status(404).send({ error: 'not_found' })
    }
    return reply.status(204).send()
  })

  app.post('/api/diary/water', { preHandler: requireAuth }, async (req, reply) => {
    const body = z
      .object({ ml: z.number().int().positive().max(5000), date: DateSchema.optional() })
      .parse(req.body)
    const date = body.date ?? dateInTz(new Date(), env.TZ)
    const entry = addWater(db, req.user!.id, date, body.ml, randomUUID())
    return reply.status(201).send(entry)
  })

  app.delete('/api/diary/water/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!deleteWater(db, req.user!.id, id)) {
      return reply.status(404).send({ error: 'not_found' })
    }
    return reply.status(204).send()
  })
}
