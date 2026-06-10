// LLM candidate reranking for the tracker: the FTS search supplies the
// candidates, Claude Haiku picks the one that nutritionally represents the
// typed ingredient ("Spitzpaprika" → Gemüsepaprika) — replacing an endless
// curated-synonym treadmill. Strictly best-effort: any error, timeout or
// missing API key falls back to the FTS ranking. Results are cached globally
// (match_cache), so each unique ingredient name is ranked at most once ever.

import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'

export interface RerankLine {
  name: string
  candidates: { id: string; label: string }[]
}

/** Returns the chosen candidate id per line, or null to keep the FTS order. */
export type AiRerank = (lines: RerankLine[]) => Promise<(string | null)[]>

const SYSTEM = `Du ordnest getippte Zutaten dem fachlich passenden Eintrag einer deutschen Lebensmitteldatenbank zu.

Du bekommst nummerierte Zutaten, jede mit nummerierten Kandidaten. Wähle pro Zutat den Kandidaten, der die Zutat ernährungsphysiologisch am besten repräsentiert:
- Generische Entsprechungen sind richtig (Spitzpaprika → Gemüsepaprika; Hähnchen → Hähnchenbrustfilet).
- Für pur genannte Zutaten das Grundprodukt (roh/natur) bevorzugen, keine Gerichte, Saucen oder Süßspeisen daraus.
- Fettstufen/Prozentangaben in der Zutat ernst nehmen.
- candidate = -1 NUR, wenn kein Kandidat auch nur entfernt passt.

Antworte ausschließlich mit dem JSON.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    choices: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          line: { type: 'integer' },
          candidate: { type: 'integer' },
        },
        required: ['line', 'candidate'],
      },
    },
  },
  required: ['choices'],
}

export const aiRerank: AiRerank = async (lines) => {
  const fallback: (string | null)[] = lines.map(() => null)
  if (!env.ANTHROPIC_API_KEY || lines.length === 0) return fallback

  const prompt = lines
    .map(
      (line, i) =>
        `Zutat ${i}: "${line.name}"\n` +
        line.candidates.map((c, j) => `  Kandidat ${j}: ${c.label}`).join('\n'),
    )
    .join('\n\n')

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 8000, maxRetries: 0 })
    const res = await client.messages.create({
      model: env.RECIPE_LLM_MODEL,
      max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    })
    const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) return fallback
    const parsed = JSON.parse(textBlock.text) as { choices?: { line: number; candidate: number }[] }
    const picks = fallback.slice()
    for (const choice of parsed.choices ?? []) {
      const line = lines[choice.line]
      if (!line) continue
      const candidate = line.candidates[choice.candidate]
      if (candidate) picks[choice.line] = candidate.id
    }
    return picks
  } catch {
    return fallback // matching must never break because the LLM is down
  }
}
