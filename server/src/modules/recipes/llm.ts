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

// Human-readable language names (in German) for the few locales the app ships
// in; unknown codes fall back to the raw code, which the model still resolves.
const LANG_LABEL: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  fr: 'Französisch',
  es: 'Spanisch',
  it: 'Italienisch',
  nl: 'Niederländisch',
  pt: 'Portugiesisch',
}

/** Normalizes a locale like "de-DE" to a bare lowercase language code ("de"). */
export function normalizeLang(code: string | undefined | null): string {
  const base = (code ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return base || 'de'
}

const langLabel = (code: string): string => LANG_LABEL[code] ?? code

/**
 * Builds the extraction system prompt for a target language. The model both
 * extracts the ingredient list AND translates user-facing text into `lang`,
 * normalizing every amount to the metric system on the way.
 */
function buildSystem(lang: string): string {
  const L = langLabel(lang)
  return `Du extrahierst die Zutatenliste aus Rezept-Text (beliebige Sprache, beliebiges Format: Blog-Artikel, Social-Media-Caption, eingefügter Text) und gibst sie in der Zielsprache ${L} mit metrischen Einheiten zurück.

Gib zurück:
- title: der Rezept-Titel, übersetzt nach ${L}; "" wenn keiner erkennbar ist.
- servings: Anzahl der Portionen als ganze Zahl, oder 0 wenn nicht angegeben.
- ingredients: ein Eintrag pro Zutat.
- steps: die Zubereitungsschritte, übersetzt nach ${L}, als kurze Strings in Reihenfolge; leeres Array, wenn keine erkennbar sind.
- difficulty: Schwierigkeit als „einfach", „mittel" oder „schwer" (schätze anhand Zutaten/Schritten); "" wenn unklar.
- totalMinutes: geschätzte Gesamtzeit in Minuten als ganze Zahl (Vorbereitung + Garen/Backen); 0 wenn unklar.

Pro Zutat:
- raw: die ursprüngliche Zeile, so wie sie im Quelltext steht — NICHT übersetzen, NICHT umrechnen.
- quantity: die Menge als String, nach metrischer Umrechnung. Bereiche ("2-3") und Brüche ("1/2") beibehalten, wenn keine Umrechnung nötig ist; "" wenn keine.
- unit: die metrische Einheit in Kleinbuchstaben (g, kg, ml, l, EL, TL, Prise, Stück, Dose, Bund, …); "" wenn keine.
- name: nur der Kern-Name der Zutat, übersetzt nach ${L}, ohne Menge, Einheit oder Zubereitungs-Zusätze.

Sprache & Übersetzung:
- Übersetze title, jeden Zutaten-Namen (name) und jeden Schritt (steps) nach ${L}. Nur raw bleibt im Original.
- Ist der Text bereits in ${L}, übernimm Titel, Namen und Schritte WÖRTLICH, ohne Umformulierung.

Einheiten — immer ins metrische System umrechnen:
- US-/imperiale Mengen umrechnen: cup/cups, oz, lb, fl oz, stick, °F.
- Volumen → ml bzw. l: 1 cup ≈ 240 ml, 1 fl oz ≈ 30 ml. Ab 1000 ml in l.
- Gewicht → g bzw. kg: 1 oz ≈ 28 g, 1 lb ≈ 454 g, 1 stick Butter ≈ 113 g. Ab 1000 g in kg.
- Trockene "cup"-Mengen über die Dichte in Gramm: Mehl 1 cup ≈ 120 g, Zucker 1 cup ≈ 200 g, brauner Zucker ≈ 220 g, Butter ≈ 225 g, gehackte Nüsse ≈ 120 g, Kakao ≈ 100 g, Milch/Wasser ≈ 240 g, Honig ≈ 340 g. Unbekannte Zutat: plausibel schätzen.
- Esslöffel/tablespoon → "EL", Teelöffel/teaspoon → "TL" (NICHT in ml umrechnen).
- Ofentemperaturen in den Schritten von °F nach °C umrechnen (°C = (°F−32)×5/9, auf 5 °C runden), z. B. "350°F" → "175 °C".
- Sinnvoll runden, keine krummen Zahlen ("118,3 g" → "120 g"). Dezimaltrennzeichen der Zielsprache verwenden (Deutsch: Komma, z. B. "1,5").

Regeln:
- Bei "X oder Y"-Alternativen nimm X als name, behalte den vollen Text in raw.
- Zubereitungsschritte gehören in steps, NICHT in ingredients. Lass Überschriften, Einleitung, Hashtags, Links, Emojis und Nährwert-Angaben ganz weg.
- Erfinde nichts. Extrahiere nur, was im Text steht.`
}

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

/**
 * Extracts a normalized ingredient list from arbitrary recipe text via Claude,
 * translating user-facing text into `targetLang` and converting amounts to
 * metric units. `targetLang` is a locale or bare code ("de", "en-US").
 */
export async function extractWithLlm(text: string, targetLang = 'de'): Promise<LlmRecipe> {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) throw new RecipeImportError('import_unavailable', 503, 'ANTHROPIC_API_KEY not set')
  const client = new Anthropic({ apiKey })
  const system = buildSystem(normalizeLang(targetLang))

  let lastError: unknown
  // Structured outputs constrain the shape but do not *guarantee* valid JSON,
  // so validate and retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await client.messages.create({
        model: env.RECIPE_LLM_MODEL,
        max_tokens: 8192,
        system,
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
