import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'
import { RecipeImportError } from '../recipes/errors.js'
import type { ExtractedIngredient } from '../recipes/types.js'

export interface WizardBudget {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface WizardInput {
  /** Freitext-Wünsche der Person (Vorschläge + eigene Eingabe), kann leer sein. */
  wish: string
  pantry: { name: string; amount: number; unit: 'g' | 'ml' }[]
  budget: WizardBudget | null
}

export interface WizardNutrition {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface WizardRecipe {
  title: string
  servings: number
  ingredients: ExtractedIngredient[]
  steps: string[]
  difficulty: string | null
  totalMinutes: number | null
  nutrition: WizardNutrition // pro Portion
  note: string | null
}

const SYSTEM = `Du bist ein kreativer Koch und Ernährungsberater. Du entwirfst GENAU EIN gut kochbares Rezept für 1 Portion, das möglichst aus den vorhandenen Vorräten der Person gekocht wird.

Regeln:
- Nutze bevorzugt die gelisteten Vorräte. Grundzutaten (Salz, Pfeffer, Wasser, Öl, gängige Gewürze) darfst du voraussetzen, auch wenn sie nicht gelistet sind. Erfinde keine exotischen Zutaten, die niemand zu Hause hat.
- Berücksichtige die Wünsche der Person sinnvoll – z. B. „herzhaft", „süß", „low carb" (wenig Kohlenhydrate: kaum Nudeln, Reis, Kartoffeln, Brot, Zucker, Mehl; Fokus auf Eiweiß, Gemüse und gute Fette), „proteinreich", „schnell", „vegetarisch". Die Wünsche sind Vorschläge: ergänze sie sinnvoll, kombiniere sie und gleiche Widersprüche pragmatisch aus. Sind keine Wünsche genannt oder lassen sie sich mit dem Vorrat nicht umsetzen, wähle eigenständig etwas Passendes und Sinnvolles.
- Wenn ein Budget angegeben ist, soll das Gericht ungefähr so viele Kalorien haben (Tagesrest) und die fehlenden Makros möglichst gut decken (bleib eher unter dem kcal-Rest, übertreibe nicht).
- Alles auf Deutsch, Einheiten metrisch. Sinnvolle, realistische Mengen und Nährwerte – nicht schönrechnen.

Gib ausschließlich das JSON-Objekt gemäß Schema zurück:
- title: appetitlicher deutscher Titel.
- servings: 1.
- ingredients: ein Eintrag pro Zutat. raw = lesbare Zeile („200 g Magerquark"); quantity = Menge als String; unit = metrische Einheit klein (g, ml, EL, TL, Stück, Prise, …) oder ""; name = reiner Zutatenname.
- steps: kurze Zubereitungsschritte in Reihenfolge.
- difficulty: „einfach", „mittel" oder „schwer".
- totalMinutes: geschätzte Gesamtzeit in Minuten.
- nutritionPerServing: realistische Schätzung { kcal, protein, carbs, fat } in g.
- note: ein kurzer deutscher Satz, warum das Gericht passt (z. B. „Deckt deinen Eiweißbedarf und bleibt im Budget."); "" wenn nichts Sinnvolles.`

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
    steps: { type: 'array', items: { type: 'string' } },
    difficulty: { type: 'string', enum: ['einfach', 'mittel', 'schwer', ''] },
    totalMinutes: { type: 'integer' },
    nutritionPerServing: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kcal: { type: 'integer' },
        protein: { type: 'integer' },
        carbs: { type: 'integer' },
        fat: { type: 'integer' },
      },
      required: ['kcal', 'protein', 'carbs', 'fat'],
    },
    note: { type: 'string' },
  },
  required: ['title', 'servings', 'ingredients', 'steps', 'difficulty', 'totalMinutes', 'nutritionPerServing', 'note'],
}

export function buildUserMessage(input: WizardInput): string {
  const lines: string[] = ['Vorräte:']
  for (const p of input.pantry) lines.push(`- ${p.name}: ${p.amount} ${p.unit}`)
  lines.push('', 'Vorgaben:')
  lines.push(input.wish.trim() ? `- Wünsche: ${input.wish.trim()}` : '- Wünsche: keine besonderen – wähle eigenständig etwas Sinnvolles.')
  if (input.budget) {
    const b = input.budget
    lines.push(
      `- Budget: ca. ${b.kcal} kcal übrig; fehlende Makros bis zum Tagesziel – Eiweiß ${b.protein} g, Kohlenhydrate ${b.carbs} g, Fett ${b.fat} g.`,
    )
  } else {
    lines.push('- Kein Budget-Bezug (frei wählbar).')
  }
  return lines.join('\n')
}

/** Erzeugt aus Vorräten + Vorgaben ein Rezept via Claude (Structured Output + 1 Retry). */
export async function generateRecipe(input: WizardInput): Promise<WizardRecipe> {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) throw new RecipeImportError('import_unavailable', 503, 'ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey })
  const user = buildUserMessage(input)

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client.messages.create({
        model: env.RECIPE_LLM_MODEL,
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: 'user', content: user }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      })
      const parsed = parseWizard(res)
      if (parsed) return parsed
    } catch (e) {
      lastError = e
      if (e instanceof Anthropic.AuthenticationError) {
        throw new RecipeImportError('import_unavailable', 503, 'invalid ANTHROPIC_API_KEY')
      }
    }
  }
  throw new RecipeImportError('llm_failed', 502, lastError instanceof Error ? lastError.message : 'wizard failed')
}

function parseWizard(res: Anthropic.Message): WizardRecipe | null {
  const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!textBlock) return null
  return parseWizardText(textBlock.text)
}

export function parseWizardText(text: string): WizardRecipe | null {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
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
  if (ingredients.length === 0) return null

  const steps = Array.isArray(o.steps)
    ? o.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
    : []

  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Rezept aus deinem Vorrat'
  const difficulty =
    typeof o.difficulty === 'string' && ['einfach', 'mittel', 'schwer'].includes(o.difficulty) ? o.difficulty : null
  const totalMinutes = typeof o.totalMinutes === 'number' && o.totalMinutes > 0 ? Math.round(o.totalMinutes) : null
  const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim() : null

  const n = (o.nutritionPerServing ?? {}) as Record<string, unknown>
  const num = (v: unknown): number => (typeof v === 'number' && v >= 0 ? Math.round(v) : 0)
  const nutrition: WizardNutrition = { kcal: num(n.kcal), protein: num(n.protein), carbs: num(n.carbs), fat: num(n.fat) }

  return { title, servings: 1, ingredients, steps, difficulty, totalMinutes, nutrition, note }
}
