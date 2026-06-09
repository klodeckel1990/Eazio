// Builds the search_terms column feeding the foods_fts index. The FTS tokenizer
// (unicode61 remove_diacritics 2) already matches "Musli" → "Müsli"; what it
// cannot do is the German ue/oe/ae transliteration ("muesli") or splitting
// compounds ("vollkornbrot" when the user types "brot"), so those variants are
// materialized here at write time.

const UMLAUT_MAP: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

// Common food-compound heads: a token ending in one of these is additionally
// indexed as the bare head ("kalbslende" → "lende"). Curated, not linguistic.
const COMPOUND_HEADS = [
  'aufstrich', 'auflauf', 'braten', 'brot', 'broetchen', 'butter', 'creme', 'eis',
  'filet', 'flocken', 'fleisch', 'gemuese', 'joghurt', 'kaese', 'keule', 'kuchen',
  'lende', 'marmelade', 'mehl', 'milch', 'mus', 'nudeln', 'oel', 'pulver', 'quark',
  'reis', 'saft', 'salat', 'sauce', 'schinken', 'schnitzel', 'sosse', 'speck',
  'suppe', 'wurst', 'zucker',
]

export function foldGerman(text: string): string {
  return text.toLowerCase().replace(/[äöüß]/g, (c) => UMLAUT_MAP[c] ?? c)
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1)
}

/** Variants for one token: ue/oe/ae transliteration + compound-head split. */
function variants(token: string): string[] {
  const out = new Set<string>()
  const folded = foldGerman(token)
  if (folded !== token) out.add(folded)
  for (const head of COMPOUND_HEADS) {
    if (folded.length > head.length + 2 && folded.endsWith(head)) {
      out.add(head)
      out.add(folded.slice(0, folded.length - head.length))
      break
    }
  }
  return [...out]
}

/** Extra index terms for a food name (and optional brand); deduplicated, may be empty. */
export function buildSearchTerms(name: string, brand?: string | null): string {
  const terms = new Set<string>()
  for (const token of tokenize(name)) for (const v of variants(token)) terms.add(v)
  if (brand) for (const token of tokenize(brand)) for (const v of variants(token)) terms.add(v)
  // BLS writes many compounds as separate words ("Hafer Flocken", "Müsli-Riegel"
  // splits on the hyphen) — index the joined form so "haferflocken" matches.
  const head = name.split(',')[0] ?? name
  const headTokens = tokenize(head)
  if (headTokens.length >= 2 && headTokens.length <= 3) {
    terms.add(headTokens.map(foldGerman).join(''))
  }
  return [...terms].join(' ')
}

/**
 * Turns user input into an FTS5 query. Per token, the exact term and the
 * prefix form are OR-ed (documents matching exactly hit both alternatives and
 * rank above prefix-only compound matches), plus the German transliteration
 * variant so "muesli" finds "Müsli" and vice versa. Groups are AND-ed —
 * FTS5 rejects implicit AND between parenthesized expressions.
 */
export function buildFtsQuery(input: string): string | null {
  const tokens = tokenize(input).slice(0, 6)
  if (tokens.length === 0) return null
  const parts = tokens.map((t) => {
    const exact = (s: string) => `"${s.replace(/"/g, '')}"`
    const prefix = (s: string) => `${exact(s)}*`
    const folded = foldGerman(t)
    const alts = folded !== t ? [exact(t), prefix(t), exact(folded), prefix(folded)] : [exact(t), prefix(t)]
    return `(${alts.join(' OR ')})`
  })
  return parts.join(' AND ')
}
