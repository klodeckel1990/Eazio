// Nährwerttabellen-Scan: ein Foto der Verpackungs-Nutribox geht an Claude
// (Vision), zurück kommen die Werte pro 100 g/ml als Vorbefüllung für das
// "Eigenes Produkt"-Formular. Best-effort wie das AI-Reranking: ohne API-Key
// oder bei Fehlern gibt es null und der Nutzer tippt die Werte von Hand.

import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'

export interface LabelScanResult {
  name: string | null
  brand: string | null
  /** pro 100 g bzw. 100 ml */
  kcal: number | null
  protein: number | null
  fat: number | null
  saturatedFat: number | null
  carbs: number | null
  sugar: number | null
  fiber: number | null
  salt: number | null
  /** auf der Packung angegebene Portionsgröße in Gramm/Millilitern */
  servingG: number | null
}

export type LabelMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

const SYSTEM = `Du liest Nährwerttabellen von Lebensmittelverpackungen aus Fotos.

Extrahiere die Nährwerte PRO 100 g bzw. 100 ml:
- Zeigt die Tabelle nur Werte pro Portion, rechne sie über die angegebene Portionsgröße auf 100 g um. Ist das nicht möglich, gib null an.
- Energie: bevorzuge den kcal-Wert. Steht nur kJ da, rechne um (kcal = kJ / 4,184).
- Dezimalkomma als Dezimalpunkt interpretieren ("4,5 g" → 4.5).
- name: Produktname von der Verpackung, falls erkennbar (sonst null). brand: Hersteller/Marke, falls erkennbar (sonst null).
- servingG: die auf der Packung genannte Portionsgröße in Gramm/Millilitern (sonst null).
- Werte, die nicht lesbar oder nicht angegeben sind: null. Niemals raten oder typische Werte erfinden.

Antworte ausschließlich mit dem JSON.`

const NUM = { type: ['number', 'null'] }
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: ['string', 'null'] },
    brand: { type: ['string', 'null'] },
    kcal: NUM,
    protein: NUM,
    fat: NUM,
    saturatedFat: NUM,
    carbs: NUM,
    sugar: NUM,
    fiber: NUM,
    salt: NUM,
    servingG: NUM,
  },
  required: ['name', 'brand', 'kcal', 'protein', 'fat', 'saturatedFat', 'carbs', 'sugar', 'fiber', 'salt', 'servingG'],
}

const clamp = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10) / 10 : null

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export async function scanNutritionLabel(
  imageBase64: string,
  mediaType: LabelMediaType,
): Promise<LabelScanResult | null> {
  if (!env.ANTHROPIC_API_KEY) return null
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 })
    const res = await client.messages.create({
      model: env.RECIPE_LLM_MODEL,
      max_tokens: 500,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Lies die Nährwerttabelle und antworte mit dem JSON.' },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    })
    const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) return null
    const raw = JSON.parse(textBlock.text) as Record<string, unknown>
    return {
      name: str(raw.name, 120),
      brand: str(raw.brand, 80),
      kcal: clamp(raw.kcal, 1000),
      protein: clamp(raw.protein, 100),
      fat: clamp(raw.fat, 100),
      saturatedFat: clamp(raw.saturatedFat, 100),
      carbs: clamp(raw.carbs, 100),
      sugar: clamp(raw.sugar, 100),
      fiber: clamp(raw.fiber, 100),
      salt: clamp(raw.salt, 100),
      servingG: clamp(raw.servingG, 5000),
    }
  } catch {
    return null // Formular bleibt nutzbar — der Nutzer tippt die Werte selbst
  }
}
