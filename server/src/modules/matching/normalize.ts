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
  'puriert', 'purierte', 'fein', 'feine', 'feiner', 'grob', 'grobe',
  'optional', 'ca', 'etwa', 'etwas', 'evtl', 'ggf', 'ungefahr',
  'nach', 'geschmack', 'wahl', 'belieben', 'saison', 'pro', 'portion', 'stuck',
  'der', 'die', 'das',
])

/**
 * Builds a Yazio search query from a parsed ingredient name: keep the first of
 * "X oder Y" alternatives and drop filler/qualifier words so the core product
 * term remains (e.g. "kleine reife Banane" → "Banane", "gemischte Beeren der
 * Saison" → "Beeren"). Falls back to the trimmed original if all words strip out.
 */
export function buildSearchQuery(name: string): string {
  const firstAlternative = name.split(/\s+(?:oder|bzw\.?|alternativ)\s+/i)[0] ?? name
  const kept = firstAlternative
    .split(/\s+/)
    .map((tok) => tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((tok) => tok.length > 0 && !QUALIFIERS.has(normalizeName(tok)))
  const query = kept.join(' ').trim()
  return query.length > 0 ? query : name.trim()
}
