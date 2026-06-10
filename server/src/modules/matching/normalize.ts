export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim()
}

// Filler / qualifier words that hurt product search — size, ripeness, preparation
// and generic phrases. Stored in normalizeName() form (lowercase, accent- and
// ß-folded) and matched whole-word, so compound names like "Feinblatt" survive.
const QUALIFIERS = new Set([
  'klein', 'kleine', 'kleiner', 'kleines', 'gross', 'grosse', 'grosser', 'grosses', 'grossen',
  'mittel', 'mittelgross', 'mittelgrosse',
  'reif', 'reife', 'reifer', 'reifes', 'frisch', 'frische', 'frischer', 'frisches',
  'roh', 'rohe', 'roher', 'gekocht', 'gekochte', 'gedunstet', 'gedunstete',
  'getrocknet', 'getrocknete', 'tiefgekuhlt', 'tiefgekuhlte', 'gefroren', 'gefrorene',
  'gemischt', 'gemischte', 'gemischter', 'geschrotet', 'geschrotete',
  'gemahlen', 'gemahlene', 'gehackt', 'gehackte', 'gerieben', 'geriebene',
  'weich', 'weiche', 'weicher', 'weiches', 'zerlassen', 'zerlassene',
  'geschmolzen', 'geschmolzene', 'gewurfelt', 'gewurfelte', 'gedampft', 'gedampfte',
  'puriert', 'purierte', 'fein', 'feine', 'feiner', 'grob', 'grobe',
  'optional', 'ca', 'etwa', 'etwas', 'evtl', 'ggf', 'ungefahr',
  'nach', 'geschmack', 'wahl', 'belieben', 'saison', 'pro', 'portion', 'stuck',
  'der', 'die', 'das',
  // bundle/packaging words that survive parsing in older saved texts
  'bund', 'zehe', 'zehen', 'stange', 'stangen', 'kopf', 'zweig', 'zweige',
  'packung', 'packchen', 'beutel', 'wurfel', 'handvoll', 'blatt', 'blatter',
  // fraction words (safety net for already-saved texts)
  'halb', 'halbe', 'halber', 'halbes', 'viertel', 'dreiviertel',
  // leanness adjectives — the AI rerank still sees the full name and can
  // prefer the matching fat level among the candidates
  'mager', 'magere', 'mageres', 'magerer',
  'fettarm', 'fettarme', 'fettarmes', 'fettarmer',
])

/**
 * Builds a Yazio search query from a parsed ingredient name: keep the first of
 * "X oder Y" alternatives and drop filler/qualifier words so the core product
 * term remains (e.g. "kleine reife Banane" → "Banane", "gemischte Beeren der
 * Saison" → "Beeren"). Falls back to the trimmed original if all words strip out.
 */
/** Drops purpose clauses — they are not part of the product name:
 *  "Öl zum Braten" → "Öl". Without this, FTS matches dishes/spreads whose
 *  NAME contains "zum Braten", and cache keys never repeat. */
export function stripPurpose(name: string): string {
  const stripped = name.replace(/\s+(?:zum|zur|für|fuer)\s+.+$/i, '').trim()
  return stripped.length > 0 ? stripped : name
}

export function buildSearchQuery(name: string): string {
  const firstAlternative = name.split(/\s+(?:oder|bzw\.?|alternativ)\s+/i)[0] ?? name
  const kept = stripPurpose(firstAlternative)
    .split(/\s+/)
    .map((tok) => tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((tok) => tok.length > 0 && !QUALIFIERS.has(normalizeName(tok)))
  const query = kept.join(' ').trim()
  return query.length > 0 ? query : name.trim()
}

// Pure seasonings / spices to exclude from tracking (matched whole-word in
// normalizeName() form). Ambiguous foods (Paprika, Ingwer, Knoblauch, Zwiebel,
// Chili) are deliberately NOT here — only their unambiguous "…pulver" spice forms.
const SEASONINGS = new Set([
  // salt & pepper (incl. common compounds)
  'salz', 'meersalz', 'steinsalz', 'jodsalz', 'gewurzsalz', 'krautersalz',
  'pfeffer', 'pfefferkorn', 'pfefferkorner', 'cayennepfeffer',
  // generic
  'gewurz', 'gewurze', 'gewurzmischung', 'krauter',
  // unambiguous ground-spice forms of otherwise-ambiguous foods
  'paprikapulver', 'chilipulver', 'currypulver', 'knoblauchpulver', 'zwiebelpulver', 'ingwerpulver',
  // spices
  'muskat', 'muskatnuss', 'zimt', 'kurkuma', 'curry', 'kreuzkummel', 'kummel', 'koriander',
  'kardamom', 'piment', 'nelken', 'safran', 'anis', 'sternanis', 'wacholder', 'vanille',
  'lorbeer', 'lorbeerblatt', 'lorbeerblatter',
  // herbs
  'oregano', 'basilikum', 'thymian', 'rosmarin', 'majoran', 'salbei', 'petersilie',
  'schnittlauch', 'dill', 'estragon', 'kerbel', 'minze', 'pfefferminze', 'bohnenkraut', 'kresse',
])

// Prep notes whose amount is negligible and unknowable: greasing the tin,
// flouring the work surface, dusting. NOT "zum Braten/Ausbacken" — frying fat
// is largely consumed and belongs in the diary.
const PREP_NOTE = new RegExp(
  [
    'fur (die |das |eine )?(form|backform|kastenform|springform|kuchenform|muffinform|auflaufform|blech|backblech|pfanne|arbeitsflache|arbeitsplatte)',
    'zum (einfetten|ausfetten|befetten|fetten|bemehlen|bestauben|ausstauben|bestreuen der form)',
  ].join('|'),
)

/** True for negligible prep notes ("etwas Butter für die Form", "Mehl zum
 *  Bestäuben") — skipped like seasonings instead of defaulting to 100 g. */
export function isPrepNote(name: string): boolean {
  return PREP_NOTE.test(normalizeName(name))
}

/** True if the ingredient name is a pure seasoning/spice (any whole word matches
 *  the curated list). Ambiguous foods like "Paprika" or "Knoblauch" return false. */
export function isSeasoning(name: string): boolean {
  return normalizeName(name)
    .split(/\s+/)
    .map((tok) => tok.replace(/[^\p{L}\p{N}]/gu, ''))
    .some((tok) => SEASONINGS.has(tok))
}
