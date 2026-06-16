// Mahlzeiten-Foto → Claude (Vision): erkennt die sichtbaren Lebensmittel und
// schätzt realistische Portionsmengen in Gramm. Das Ergebnis wird als
// Zutaten-Text formatiert und durch den bestehenden Foods-Matcher geschickt —
// so teilt sich der Foto-Pfad die komplette Match-/Logging-Logik mit dem
// Texteingabe-Pfad. Best-effort wie der Nährwert-Scan: ohne API-Key/bei
// Fehlern null, dann bleibt nur die manuelle Eingabe.

import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'

export type PhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface DetectedFoodItem {
  /** Lebensmittel-Name (Deutsch), ohne Menge */
  name: string
  /** geschätzte verzehrte Menge in Gramm */
  amountG: number
}

export interface MealPhotoResult {
  items: DetectedFoodItem[]
  /** Tageszeit, zu der die Mahlzeit am ehesten passt (oder null) */
  mealGuess: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const

const SYSTEM = `Du analysierst Fotos von Mahlzeiten für ein Ernährungstagebuch und schätzt, was und wie viel gegessen wird.

Gib zurück:
- items: ein Eintrag pro klar erkennbarer Komponente der Mahlzeit.
- mealGuess: zu welcher Tageszeit die Mahlzeit am besten passt — "breakfast", "lunch", "dinner" oder "snack"; null wenn unklar.

Pro Eintrag:
- name: der Lebensmittel-Name auf Deutsch, ohne Menge und ohne Zubereitungs-Zusätze (z. B. "Hähnchenbrust", "Basmatireis", "Brokkoli", "Olivenöl").
- amountG: die geschätzte verzehrte Menge in GRAMM als Zahl (bei Getränken/Flüssigem in Milliliter, als Zahl).

Mengenschätzung — realistisch und portionsbewusst:
- Nutze sichtbare Hinweise (Tellergröße ~26 cm, Besteck, Gläser ~200–300 ml) als Maßstab.
- Typische Portionen als Anker: gekochter Reis/Nudeln 150–250 g, Fleisch/Fisch 120–200 g, Gemüsebeilage 80–150 g, Brotscheibe ~45 g, Ei ~55 g, Öl zum Braten 5–15 g.
- Lieber eine plausible mittlere Schätzung als Extreme. Keine krummen Zahlen, sinnvoll runden.

Regeln:
- Nur erfassen, was wirklich sichtbar ist. Nichts erfinden, keine vermuteten Beilagen ergänzen.
- Zusammengesetzte Gerichte wenn möglich in Hauptkomponenten zerlegen (z. B. "Pasta mit Tomatensauce" → "Nudeln" + "Tomatensauce"); ist eine Trennung nicht sinnvoll, ein Eintrag für das Gericht.
- Ist auf dem Bild kein Essen erkennbar, gib items als leeres Array zurück.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          amountG: { type: 'number' },
        },
        required: ['name', 'amountG'],
      },
    },
    mealGuess: { type: ['string', 'null'] },
  },
  required: ['items', 'mealGuess'],
}

/** Detektierte Items als Zutaten-Text ("180 g Hähnchenbrust"), den der
 *  Foods-Matcher (matchFoodText) parst — eine Zeile pro Eintrag. */
export function itemsToText(items: DetectedFoodItem[]): string {
  return items.map((it) => `${Math.round(it.amountG)} g ${it.name}`).join('\n')
}

export async function analyzeMealPhoto(
  imageBase64: string,
  mediaType: PhotoMediaType,
): Promise<MealPhotoResult | null> {
  if (!env.ANTHROPIC_API_KEY) return null
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 40_000, maxRetries: 1 })
    const res = await client.messages.create({
      model: env.PHOTO_LLM_MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Analysiere die Mahlzeit und antworte mit dem JSON.' },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    })
    const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) return null
    const raw = JSON.parse(textBlock.text) as Record<string, unknown>

    const items: DetectedFoodItem[] = []
    if (Array.isArray(raw.items)) {
      for (const it of raw.items) {
        if (!it || typeof it !== 'object') continue
        const o = it as Record<string, unknown>
        const name = typeof o.name === 'string' ? o.name.trim() : ''
        const amountG = typeof o.amountG === 'number' && Number.isFinite(o.amountG) ? o.amountG : 0
        if (!name || amountG <= 0) continue
        items.push({ name: name.slice(0, 120), amountG: Math.min(Math.round(amountG), 5000) })
      }
    }
    const mealGuess = MEALS.includes(raw.mealGuess as (typeof MEALS)[number])
      ? (raw.mealGuess as MealPhotoResult['mealGuess'])
      : null
    return { items, mealGuess }
  } catch {
    return null
  }
}
