import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../auth-guard.js'
import { env } from '../../config/env.js'
import { importRecipe } from '../../modules/recipes/import.js'
import { RecipeImportError } from '../../modules/recipes/errors.js'

const ImportSchema = z
  .object({
    url: z.string().url().optional(),
    text: z.string().min(1).max(20000).optional(),
  })
  .refine((d) => Boolean(d.url) || Boolean(d.text), { message: 'url or text is required' })

export function registerRecipeRoutes(app: FastifyInstance): void {
  // Import a recipe from a link or pasted text and return a (not-yet-saved)
  // preview. Rate-limited because each call may hit the LLM.
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
}
