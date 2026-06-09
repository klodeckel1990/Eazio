import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { env } from '../../config/env.js'
import { importRecipe } from '../../modules/recipes/import.js'
import { RecipeImportError } from '../../modules/recipes/errors.js'
import {
  createRecipe,
  listRecipes,
  getRecipe,
  removeRecipe,
} from '../../modules/recipes/recipes.repo.js'

const ImportSchema = z
  .object({
    url: z.string().url().optional(),
    text: z.string().min(1).max(20000).optional(),
  })
  .refine((d) => Boolean(d.url) || Boolean(d.text), { message: 'url or text is required' })

const IngredientSchema = z.object({
  raw: z.string().max(500),
  quantity: z.string().max(50),
  unit: z.string().max(50),
  name: z.string().min(1).max(200),
})

const SaveSchema = z.object({
  title: z.string().max(200).optional(),
  servings: z.number().int().positive().max(999).nullable().optional(),
  sourceUrl: z.string().max(2000).nullable().optional(),
  sourceType: z.enum(['link', 'text']).default('text'),
  ingredients: z.array(IngredientSchema).min(1).max(100),
})

const IdParams = z.object({ id: z.string().min(1) })

export function registerRecipeRoutes(app: FastifyInstance, db: DB): void {
  // Import a recipe from a link or pasted text → not-yet-saved preview.
  app.post(
    '/api/recipes/import',
    { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      if (!env.ANTHROPIC_API_KEY) return reply.status(503).send({ error: 'import_unavailable' })
      const body = ImportSchema.parse(req.body)
      try {
        const recipe = await importRecipe({ url: body.url, text: body.text })
        return reply.status(200).send(recipe)
      } catch (e) {
        if (e instanceof RecipeImportError) return reply.status(e.status).send({ error: e.code })
        throw e
      }
    },
  )

  app.post('/api/recipes', { preHandler: requireAuth }, async (req, reply) => {
    const body = SaveSchema.parse(req.body)
    const summary = createRecipe(db, req.user!.id, {
      title: body.title?.trim() || 'Unbenanntes Rezept',
      servings: body.servings ?? null,
      sourceUrl: body.sourceUrl ?? null,
      sourceType: body.sourceType,
      ingredients: body.ingredients,
    })
    return reply.status(201).send(summary)
  })

  app.get('/api/recipes', { preHandler: requireAuth }, async (req) => listRecipes(db, req.user!.id))

  app.get('/api/recipes/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const recipe = getRecipe(db, req.user!.id, id)
    if (!recipe) return reply.status(404).send({ error: 'not_found' })
    return recipe
  })

  app.delete('/api/recipes/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!removeRecipe(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })
}
