export interface ExtractResult {
  title: string | null
  servings: number | null
  /** Ingredient strings from schema.org JSON-LD; empty when none were found. */
  ingredients: string[]
  /** Preparation steps from schema.org recipeInstructions; empty when none. */
  instructions: string[]
  /** Recipe image URL (schema.org image or og:image), if any. */
  imageUrl: string | null
  /** Total time in minutes from schema.org totalTime/cookTime, if any. */
  totalMinutes: number | null
  /** Fallback page text for the LLM when no structured ingredients exist. */
  text: string | null
}

/**
 * JSON-LD-first extraction: read schema.org/Recipe (recipeIngredient, name,
 * recipeYield) when present; otherwise fall back to stripped page text (or the
 * og:description, useful for social-media pages) for the LLM to parse.
 */
export function extractFromHtml(html: string): ExtractResult {
  const recipe = findJsonLdRecipe(html)
  if (recipe) {
    const ingredients = toStringArray(recipe.recipeIngredient)
    if (ingredients.length > 0) {
      return {
        title: typeof recipe.name === 'string' && recipe.name.trim() ? recipe.name.trim() : null,
        servings: parseYield(recipe.recipeYield),
        ingredients,
        instructions: toInstructionSteps(recipe.recipeInstructions),
        imageUrl: toImageUrl(recipe.image) ?? ogImage(html),
        totalMinutes: parseDuration(recipe.totalTime) ?? parseDuration(recipe.cookTime),
        text: null,
      }
    }
  }
  const text = htmlToText(html) || ogDescription(html)
  return { title: null, servings: null, ingredients: [], instructions: [], imageUrl: ogImage(html), totalMinutes: null, text }
}

function toImageUrl(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = toImageUrl(x)
      if (u) return u
    }
    return null
  }
  if (v && typeof v === 'object') {
    const u = (v as Record<string, unknown>).url
    return typeof u === 'string' ? u.trim() || null : null
  }
  return null
}

function ogImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i)
  return m ? (m[1] ?? '').trim() || null : null
}

/** Parse an ISO 8601 duration like "PT1H30M" / "PT45M" into total minutes. */
function parseDuration(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m) return null
  const total = (m[1] ? parseInt(m[1], 10) : 0) * 60 + (m[2] ? parseInt(m[2], 10) : 0)
  return total > 0 ? total : null
}

/** recipeInstructions is polymorphic: string, string[], HowToStep[], or HowToSection[]. */
function toInstructionSteps(v: unknown): string[] {
  const out: string[] = []
  walkInstructions(v, out)
  return out
}

function walkInstructions(v: unknown, out: string[]): void {
  if (!v) return
  if (typeof v === 'string') {
    for (const part of v.split(/\n+/)) {
      const t = part.trim()
      if (t) out.push(t)
    }
    return
  }
  if (Array.isArray(v)) {
    for (const item of v) walkInstructions(item, out)
    return
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (Array.isArray(o.itemListElement)) {
      walkInstructions(o.itemListElement, out) // HowToSection
      return
    }
    const text = typeof o.text === 'string' ? o.text : typeof o.name === 'string' ? o.name : null
    if (text) {
      const t = text.trim()
      if (t) out.push(t)
    }
  }
}

function findJsonLdRecipe(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const nodes: unknown[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] ?? '').trim()
    if (!raw) continue
    try {
      collectNodes(JSON.parse(raw), nodes)
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  for (const n of nodes) {
    if (isRecipeNode(n)) return n as Record<string, unknown>
  }
  return null
}

function collectNodes(value: unknown, out: unknown[]): void {
  if (Array.isArray(value)) {
    for (const v of value) collectNodes(v, out)
  } else if (value && typeof value === 'object') {
    out.push(value)
    const graph = (value as Record<string, unknown>)['@graph']
    if (graph) collectNodes(graph, out)
  }
}

function isRecipeNode(n: unknown): boolean {
  if (!n || typeof n !== 'object') return false
  const t = (n as Record<string, unknown>)['@type']
  const types = Array.isArray(t) ? t : [t]
  return types.some((x) => typeof x === 'string' && x.toLowerCase() === 'recipe')
}

function toStringArray(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : v != null ? [v] : []
  return arr.map((x) => (typeof x === 'string' ? x.trim() : '')).filter((x) => x.length > 0)
}

/** recipeYield may be a number, "4 Portionen", ["4", "4 servings"], or {value}. */
function parseYield(v: unknown): number | null {
  if (v == null) return null
  if (Array.isArray(v)) {
    for (const item of v) {
      const n = parseYield(item)
      if (n) return n
    }
    return null
  }
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null
  if (typeof v === 'object') return parseYield((v as Record<string, unknown>)['value'])
  if (typeof v === 'string') {
    const m = v.match(/\d+/)
    if (m) {
      const n = parseInt(m[0], 10)
      return n > 0 ? n : null
    }
  }
  return null
}

function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(stripped)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n')
    .trim()
    .slice(0, 12000)
}

function ogDescription(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i)
  if (!m) return null
  const text = decodeEntities(m[1] ?? '').trim()
  return text || null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => {
      try {
        return String.fromCodePoint(parseInt(d, 10))
      } catch {
        return ''
      }
    })
}
