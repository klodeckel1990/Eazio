import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { env } from '../../config/env.js'
import { requireAuth } from '../auth-guard.js'
import { isPremium } from '../../modules/billing/entitlements.js'
import {
  addOrIncrementPantry,
  listPantry,
  removePantryItem,
  updatePantryItem,
  type PantryRow,
} from '../../modules/pantry/pantry.repo.js'
import { matchRecipes } from '../../modules/pantry/recipe-match.js'
import { generateRecipe } from '../../modules/pantry/wizard.js'
import { listRecipesWithIngredients } from '../../modules/recipes/recipes.repo.js'
import { getDay } from '../../modules/diary/diary.service.js'
import { RecipeImportError } from '../../modules/recipes/errors.js'

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

const WizardSchema = z.object({
  wish: z.string().max(500).optional(),
  useBudget: z.boolean().optional(),
})

// Getränke in ml, sonst g (gespiegelt zu lib/nutrition.isDrink + diary.isDrinkFood).
const pantryUnit = (p: PantryRow): 'g' | 'ml' =>
  p.baseUnit === 'ml' || (p.source === 'bls' && p.category === 'N') ? 'ml' : 'g'

// Vorratsschrank — gratis (anlegen/verwalten). Matching + Wizard kommen als
// Premium-Routen dazu (Phase 2/3).
export function registerPantryRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/pantry', { preHandler: requireAuth }, async (req) => ({ items: listPantry(db, req.user!.id) }))

  // „Was kann ich kochen?" — Rezepte gegen Vorrat matchen (Premium).
  app.get('/api/pantry/recipe-matches', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user!.id
    if (!isPremium(db, userId)) return reply.status(403).send({ error: 'premium_required' })
    const pantryNames = listPantry(db, userId).map((p) => p.name)
    const recipes = listRecipesWithIngredients(db, userId)
    return { matches: matchRecipes(recipes, pantryNames) }
  })

  // KI-Wizard: Rezept aus Vorräten erzeugen (Premium).
  app.post(
    '/api/pantry/wizard',
    { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const userId = req.user!.id
      if (!isPremium(db, userId)) return reply.status(403).send({ error: 'premium_required' })
      if (!env.ANTHROPIC_API_KEY) return reply.status(503).send({ error: 'wizard_unavailable' })
      const body = WizardSchema.parse(req.body)

      const rows = listPantry(db, userId)
      if (rows.length === 0) return reply.status(400).send({ error: 'empty_pantry' })
      const pantry = rows.map((p) => ({ name: p.name, amount: Math.round(p.amountG), unit: pantryUnit(p) }))

      let budget = null
      if (body.useBudget) {
        const day = getDay(db, userId)
        budget = {
          kcal: Math.max(0, day.remainingKcal),
          protein: Math.max(0, Math.round((day.goals.proteinG ?? 0) - day.totals.protein)),
          carbs: Math.max(0, Math.round((day.goals.carbsG ?? 0) - day.totals.carbs)),
          fat: Math.max(0, Math.round((day.goals.fatG ?? 0) - day.totals.fat)),
        }
      }

      try {
        const recipe = await generateRecipe({ wish: body.wish ?? '', pantry, budget })
        return reply.status(200).send({ recipe })
      } catch (e) {
        if (e instanceof RecipeImportError) return reply.status(e.status).send({ error: e.code })
        throw e
      }
    },
  )

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
