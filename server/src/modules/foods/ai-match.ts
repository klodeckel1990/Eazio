// LLM candidate reranking for the tracker: the FTS search supplies the
// candidates, Claude Haiku picks the one that nutritionally represents the
// typed ingredient ("Spitzpaprika" → Gemüsepaprika) — replacing an endless
// curated-synonym treadmill. When no candidate fits, the model proposes a
// better database-style search term ("Ei" → "Hühnerei") and the caller
// re-searches once. Strictly best-effort: any error, timeout or missing API
// key falls back to the FTS ranking. Results are cached globally
// (match_cache), so each unique ingredient name is ranked at most once ever.

import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'

export interface RerankLine {
  name: string
  candidates: { id: string; label: string }[]
}

export interface AiPick {
  /** chosen candidate id, or null when none fits */
  id: string | null
  /** alternative search term to retry with (only set when id is null) */
  retryQuery: string | null
}

export type AiRerank = (lines: RerankLine[]) => Promise<AiPick[]>

const SYSTEM = `Du ordnest getippte Zutaten dem fachlich passenden Eintrag einer deutschen Lebensmitteldatenbank (BLS-Stil) zu.

Du bekommst nummerierte Zutaten, jede mit nummerierten Kandidaten. Wähle pro Zutat den Kandidaten, der die Zutat ernährungsphysiologisch am besten repräsentiert:
- Generische Entsprechungen sind richtig (Spitzpaprika → Gemüsepaprika; Hähnchen → Hähnchenbrustfilet).
- Pure Grundbegriffe meinen die STANDARDVARIANTE: Milch → Kuhmilch/Vollmilch (3,5 %), Mehl → Weizenmehl Type 405, Ei → Hühnerei, Zucker → weißer Zucker, Reis → weißer Reis. Buttermilch, Maismehl, Wachtelei o. ä. sind dann FALSCH.
- Für pur genannte Zutaten das Grundprodukt (roh/natur) bevorzugen — niemals Gerichte, Wurst, Gebäck, Suppen oder Saucen daraus. Eine Zwiebel ist keine Zwiebelwurst, ein Ei kein Ei-Einlauf.
- Fettstufen/Prozentangaben und Zusätze wie "mager"/"light" ernst nehmen und die passende Variante wählen.
- Passt KEIN Kandidat: candidate = -1 und gib in query einen besseren deutschen Suchbegriff im Stil der Datenbank-Namen an (z. B. "Ei" → "Hühnerei", "Milch" → "Milch 3,5", "Mehl" → "Weizen Mehl"). Sonst query = "".

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
          query: { type: 'string' },
        },
        required: ['line', 'candidate', 'query'],
      },
    },
  },
  required: ['choices'],
}

export const aiRerank: AiRerank = async (lines) => {
  const fallback: AiPick[] = lines.map(() => ({ id: null, retryQuery: null }))
  if (!env.ANTHROPIC_API_KEY || lines.length === 0) return fallback

  const prompt = lines
    .map(
      (line, i) =>
        `Zutat ${i}: "${line.name}"\n` +
        (line.candidates.length === 0
          ? '  (keine Kandidaten gefunden)'
          : line.candidates.map((c, j) => `  Kandidat ${j}: ${c.label}`).join('\n')),
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
    const parsed = JSON.parse(textBlock.text) as {
      choices?: { line: number; candidate: number; query?: string }[]
    }
    const picks = fallback.map((p) => ({ ...p }))
    for (const choice of parsed.choices ?? []) {
      const line = lines[choice.line]
      if (!line) continue
      const candidate = line.candidates[choice.candidate]
      if (candidate) {
        picks[choice.line] = { id: candidate.id, retryQuery: null }
      } else {
        const query = choice.query?.trim()
        picks[choice.line] = { id: null, retryQuery: query ? query.slice(0, 80) : null }
      }
    }
    return picks
  } catch {
    return fallback // matching must never break because the LLM is down
  }
}
