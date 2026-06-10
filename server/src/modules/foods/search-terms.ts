// Builds the search_terms column feeding the foods_fts index. The FTS tokenizer
// (unicode61 remove_diacritics 2) already matches "Musli" → "Müsli"; what it
// cannot do is the German ue/oe/ae transliteration ("muesli") or splitting
// compounds ("vollkornbrot" when the user types "brot"), so those variants are
// materialized here at write time.

const UMLAUT_MAP: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

// Common food-compound heads: a token ending in one of these is additionally
// indexed as the bare head ("kalbslende" → "lende"). Curated, not linguistic.
const COMPOUND_HEADS = [
  'aufstrich', 'auflauf', 'beere', 'bohne', 'braten', 'brot', 'broetchen',
  'butter', 'creme', 'eis', 'erbse', 'filet', 'flocken', 'fleisch', 'gemuese',
  'joghurt', 'kaese', 'keule', 'kohl', 'kuchen', 'kuerbis', 'lende',
  'marmelade', 'mehl', 'melone', 'milch', 'mus', 'nudeln', 'nuss', 'oel',
  'paprika', 'pilz', 'pulver', 'quark', 'reis', 'saft', 'salat', 'sauce',
  'schinken', 'schnitzel', 'sosse', 'speck', 'suppe', 'tomate', 'traube',
  'wurst', 'zucker', 'zwiebel',
]

/**
 * Zero-hit fallback: for a compound the index does not know ("Romatomaten"),
 * return the bare head ("tomate") as a retry query — the AI rerank then picks
 * the fitting base product among the head's results.
 */
export function compoundHeadFallback(name: string): string | null {
  for (const token of tokenize(name)) {
    const folded = foldGerman(token)
    const variants = [folded, ...depluralize(folded)]
    for (const v of variants) {
      for (const head of COMPOUND_HEADS) {
        if (v.length > head.length + 2 && v.endsWith(head)) return head
      }
    }
  }
  return null
}

// Colloquial names → what the BLS actually calls the product. Matched against
// the folded food name at index time; the extra terms land in search_terms.
const NAME_SYNONYMS: { match: RegExp; terms: string }[] = [
  { match: /koerniger frischkaese|huettenkaese/, terms: 'huettenkaese hüttenkäse cottage cheese koerniger frischkaese' },
  { match: /fruehlingszwiebel/, terms: 'lauchzwiebel jungzwiebel' },
  { match: /\bhaferdrink/, terms: 'hafermilch' },
  { match: /\bsojadrink/, terms: 'sojamilch' },
  { match: /\bmandeldrink/, terms: 'mandelmilch' },
  { match: /speisequark/, terms: 'quark magerquark' },
  { match: /moehre|karotte/, terms: 'moehre möhre karotte wurzel' },
  { match: /gemuesepaprika/, terms: 'spitzpaprika paprika' },
  { match: /^tomate roh$/, terms: 'kirschtomate cherrytomate cocktailtomate cherry romatomate' },
  { match: /^rind hackfleisch/, terms: 'rinderhack rinderhackfleisch hackfleisch hack' },
  { match: /^speisezwiebel/, terms: 'zwiebel zwiebeln' },
  { match: /^huehnerei/, terms: 'ei eier' },
  { match: /^eier gekocht/, terms: 'ei' },
  // BLS 4.0 kennt keine Vollmilch — die Trinkmilch-Einträge sichtbar machen
  { match: /^milch (fettarm|entrahmt)/, terms: 'vollmilch kuhmilch trinkmilch frischmilch' },
  { match: /zuckermais/, terms: 'mais' },
  { match: /paprikaschote/, terms: 'paprika' },
]

export function foldGerman(text: string): string {
  return text.toLowerCase().replace(/[äöüß]/g, (c) => UMLAUT_MAP[c] ?? c)
}

/** German plural → singular guesses for a folded token ("zwiebeln" → "zwiebel").
 *  Prefix search only matches index tokens that START with the query token, so
 *  a plural query never finds the singular name without these variants. */
function depluralize(token: string): string[] {
  const out: string[] = []
  if (token.length >= 6 && token.endsWith('en')) out.push(token.slice(0, -2))
  if (token.length >= 5 && /[ens]$/.test(token)) out.push(token.slice(0, -1))
  return out
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    // single digits stay: "Joghurt 3,5%" → joghurt, 3, 5 — the fat percentage
    // is exactly what distinguishes the plain product from compounds
    .filter((t) => t.length > 1 || /^\d$/.test(t))
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
  const folded = foldGerman(name)
  for (const syn of NAME_SYNONYMS) {
    if (syn.match.test(folded)) for (const t of syn.terms.split(' ')) terms.add(t)
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
    const variants = new Set<string>([t, folded, ...depluralize(t), ...depluralize(folded)])
    const alts: string[] = []
    for (const v of variants) {
      alts.push(exact(v), prefix(v))
    }
    return `(${alts.join(' OR ')})`
  })
  return parts.join(' AND ')
}
