import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'
import { RecipeImportError } from './errors.js'
import type { ExtractedIngredient } from './types.js'

export interface LlmRecipe {
  title: string | null
  servings: number | null
  ingredients: ExtractedIngredient[]
  steps: string[]
  difficulty: string | null
  totalMinutes: number | null
}

const SYSTEM = `Du extrahierst die Zutatenliste aus Rezept-Text (deutsch oder englisch, beliebiges Format: Blog-Artikel, Social-Media-Caption, eingefügter Text).

Gib zurück:
- title: der Rezept-Titel, oder "" wenn keiner erkennbar ist.
- servings: Anzahl der Portionen als ganze Zahl, oder 0 wenn nicht angegeben.
- ingredients: ein Eintrag pro Zutat.
- steps: die Zubereitungsschritte als kurze Strings in Reihenfolge; leeres Array, wenn keine erkennbar sind.
- difficulty: Schwierigkeit als „einfach", „mittel" oder „schwer" (schätze anhand Zutaten/Schritten); "" wenn unklar.
- totalMinutes: geschätzte Gesamtzeit in Minuten als ganze Zahl (Vorbereitung + Garen/Backen); 0 wenn unklar.

Pro Zutat:
- raw: die ursprüngliche Zeile, so wie sie im Text steht.
- quantity: die Menge als String, exakt wie geschrieben — Bereiche ("2-3") und Brüche ("1/2") beibehalten; "" wenn keine.
- unit: die Einheit (g, ml, EL, TL, Stück, Prise, Dose, …) in Kleinbuchstaben; "" wenn keine.
- name: nur der Kern-Name der Zutat, ohne Menge, Einheit oder Zubereitungs-Zusätze.

Regeln:
- Bei "X oder Y"-Alternativen nimm X als name, behalte den vollen Text in raw.
- Zubereitungsschritte gehören in steps, NICHT in ingredients. Lass Überschriften, Einleitung, Hashtags, Links, Emojis und Nährwert-Angaben ganz weg.
- Erfinde nichts. Extrahiere nur, was im Text steht.
- Behalte die Originalsprache der Zutaten-Namen.`

// schema.org-style JSON schema for structured outputs. No nullable types: title
// is "" and servings is 0 when unknown (mapped to null after parsing).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    servings: { type: 'integer' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          raw: { type: 'string' },
          quantity: { type: 'string' },
          unit: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['raw', 'quantity', 'unit', 'name'],
      },
    },
    steps: {
      type: 'array',
      items: { type: 'string' },
    },
    difficulty: { type: 'string', enum: ['einfach', 'mittel', 'schwer', ''] },
    totalMinutes: { type: 'integer' },
  },
  required: ['title', 'servings', 'ingredients', 'steps', 'difficulty', 'totalMinutes'],
}

/** Extracts a normalized ingredient list from arbitrary recipe text via Claude. */
export async function extractWithLlm(text: string): Promise<LlmRecipe> {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) throw new RecipeImportError('import_unavailable', 503, 'ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey })

  let lastError: unknown
  // Structured outputs constrain the shape but do not *guarantee* valid JSON,
  // so validate and retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client.messages.create({
        model: env.RECIPE_LLM_MODEL,
        max_tokens: 8192,
        system: SYSTEM,
        messages: [{ role: 'user', content: text.slice(0, 16000) }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      })
      const parsed = parseRecipe(res)
      if (parsed) return parsed
    } catch (e) {
      lastError = e
      if (e instanceof Anthropic.AuthenticationError) {
        throw new RecipeImportError('import_unavailable', 503, 'invalid ANTHROPIC_API_KEY')
      }
      // transient (rate limit / overloaded / parse) — fall through and retry
    }
  }
  throw new RecipeImportError(
    'llm_failed',
    502,
    lastError instanceof Error ? lastError.message : 'extraction failed',
  )
}

function parseRecipe(res: Anthropic.Message): LlmRecipe | null {
  const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) return null

  let obj: unknown
  try {
    obj = JSON.parse(textBlock.text)
  } catch {
    const m = textBlock.text.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      obj = JSON.parse(m[0])
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (!Array.isArray(o.ingredients)) return null

  const ingredients: ExtractedIngredient[] = []
  for (const item of o.ingredients) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    if (!name) continue
    ingredients.push({
      raw: typeof r.raw === 'string' && r.raw.trim() ? r.raw.trim() : name,
      quantity: typeof r.quantity === 'string' ? r.quantity.trim() : '',
      unit: typeof r.unit === 'string' ? r.unit.trim() : '',
      name,
    })
  }

  const steps = Array.isArray(o.steps)
    ? o.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
    : []

  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null
  const servings = typeof o.servings === 'number' && o.servings > 0 ? Math.round(o.servings) : null
  const difficulty =
    typeof o.difficulty === 'string' && ['einfach', 'mittel', 'schwer'].includes(o.difficulty)
      ? o.difficulty
      : null
  const totalMinutes =
    typeof o.totalMinutes === 'number' && o.totalMinutes > 0 ? Math.round(o.totalMinutes) : null
  return { title, servings, ingredients, steps, difficulty, totalMinutes }
}
