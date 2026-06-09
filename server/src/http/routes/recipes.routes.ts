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
  updateRecipeImageMime,
  setFavorite,
  getRecipeImageMime,
  getPublicRecipe,
  getRecipeImageMimeById,
  type PublicRecipe,
} from '../../modules/recipes/recipes.repo.js'
import { cacheRecipeImage, readRecipeImage, deleteRecipeImage } from '../../modules/recipes/recipe-images.js'
import { recipeShareToken, verifyShareToken } from '../../modules/recipes/share.js'

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
  imageUrl: z.string().max(2000).nullable().optional(),
  difficulty: z.enum(['einfach', 'mittel', 'schwer']).nullable().optional(),
  totalMinutes: z.number().int().positive().max(100000).nullable().optional(),
  ingredients: z.array(IngredientSchema).min(1).max(100),
  steps: z.array(z.string().max(2000)).max(100).default([]),
})

const PatchRecipeSchema = z.object({ isFavorite: z.boolean().optional() })

const IdParams = z.object({ id: z.string().min(1) })
const ShareQuery = z.object({ t: z.string().min(1).max(64) })

const ingredientLine = (ing: { quantity: string; unit: string; name: string }): string =>
  [ing.quantity, ing.unit, ing.name].map((p) => p.trim()).filter(Boolean).join(' ')

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

function publicBase(req: { headers: Record<string, string | string[] | undefined>; protocol: string }): string {
  const fwdProto = req.headers['x-forwarded-proto']
  const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)?.split(',')[0]?.trim() || req.protocol || 'https'
  const fwdHost = req.headers['x-forwarded-host'] ?? req.headers.host
  const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost)?.split(',')[0]?.trim() ?? ''
  return `${proto}://${host}`
}

/** Minimal HTML carrying schema.org/Recipe JSON-LD for the Bring! importer. */
function renderRecipeHtml(recipe: PublicRecipe, imageUrl: string | null): string {
  const ingredients = recipe.ingredients.map(ingredientLine).filter(Boolean)
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    recipeIngredient: ingredients,
  }
  if (recipe.servings) ld.recipeYield = `${recipe.servings} Portionen`
  if (imageUrl) ld.image = imageUrl
  if (recipe.steps.length) ld.recipeInstructions = recipe.steps.map((s) => ({ '@type': 'HowToStep', text: s }))
  // Escape `<` inside the JSON so it can't terminate the <script> element.
  const json = JSON.stringify(ld).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(recipe.title)} – Eazio</title><script type="application/ld+json">${json}</script></head><body><h1>${escapeHtml(recipe.title)}</h1>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" style="max-width:100%;height:auto">` : ''}<h2>Zutaten</h2><ul>${ingredients.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>${recipe.steps.length ? `<h2>Zubereitung</h2><ol>${recipe.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>` : ''}</body></html>`
}

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
      difficulty: body.difficulty ?? null,
      totalMinutes: body.totalMinutes ?? null,
      ingredients: body.ingredients,
      steps: body.steps,
    })
    if (body.imageUrl) {
      const mime = await cacheRecipeImage(summary.id, body.imageUrl)
      if (mime) {
        updateRecipeImageMime(db, summary.id, mime)
        summary.hasImage = true
      }
    }
    return reply.status(201).send(summary)
  })

  app.get('/api/recipes', { preHandler: requireAuth }, async (req) => listRecipes(db, req.user!.id))

  app.get('/api/recipes/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const recipe = getRecipe(db, req.user!.id, id)
    if (!recipe) return reply.status(404).send({ error: 'not_found' })
    return { ...recipe, shareToken: recipeShareToken(id) }
  })

  app.get('/api/recipes/:id/image', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const mime = getRecipeImageMime(db, req.user!.id, id)
    if (!mime) return reply.status(404).send({ error: 'not_found' })
    const buf = readRecipeImage(id)
    if (!buf) return reply.status(404).send({ error: 'not_found' })
    return reply.header('content-type', mime).header('cache-control', 'private, max-age=86400').send(buf)
  })

  app.patch('/api/recipes/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const body = PatchRecipeSchema.parse(req.body)
    if (body.isFavorite !== undefined && !setFavorite(db, req.user!.id, id, body.isFavorite)) {
      return reply.status(404).send({ error: 'not_found' })
    }
    return reply.status(204).send()
  })

  app.delete('/api/recipes/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!removeRecipe(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    deleteRecipeImage(id)
    return reply.status(204).send()
  })

  // ---- Public, token-gated recipe page (no auth) -------------------------
  // Bring!'s importer fetches this URL server-side and parses the JSON-LD, so
  // it must be reachable without a session. The share token (HMAC) gates it.
  app.get('/r/:id', { config: { rateLimit: { max: 60, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const { t } = ShareQuery.parse(req.query)
    if (!verifyShareToken(id, t)) return reply.status(404).type('text/html').send('Not found')
    const recipe = getPublicRecipe(db, id)
    if (!recipe) return reply.status(404).type('text/html').send('Not found')
    const imageUrl = recipe.hasImage ? `${publicBase(req)}/r/${id}/image?t=${encodeURIComponent(t)}` : null
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .send(renderRecipeHtml(recipe, imageUrl))
  })

  app.get('/r/:id/image', { config: { rateLimit: { max: 120, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const { t } = ShareQuery.parse(req.query)
    if (!verifyShareToken(id, t)) return reply.status(404).send()
    const mime = getRecipeImageMimeById(db, id)
    if (!mime) return reply.status(404).send()
    const buf = readRecipeImage(id)
    if (!buf) return reply.status(404).send()
    return reply.header('content-type', mime).header('cache-control', 'public, max-age=86400').send(buf)
  })
}
