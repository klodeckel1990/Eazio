export interface ParsedLine {
  raw: string
  qty: number | null
  unit: string | null
  name: string
}

const KNOWN_UNITS = new Set([
  'g', 'gr', 'gramm', 'kg', 'ml', 'l',
  'stück', 'stk', 'stueck', 'portion', 'portionen', 'el', 'tl',
  'scheibe', 'scheiben', 'prise', 'prisen', 'becher', 'glas', 'dose', 'tasse',
  // bundle/count words common in recipes ("1 Bund Radieschen", "2 Zehen Knoblauch")
  'bund', 'zehe', 'zehen', 'stange', 'stangen', 'kopf', 'zweig', 'zweige',
  'packung', 'päckchen', 'paeckchen', 'beutel', 'würfel', 'wuerfel',
  'handvoll', 'blatt', 'blätter', 'blaetter', 'kugel', 'kugeln',
  'pck', 'pkt', 'bd',
])

// Recipe-site abbreviations → the canonical unit word the rest of the pipeline
// knows ("1 Pck. Vanillezucker", "1 Bd Lauchzwiebeln").
const UNIT_ALIASES: Record<string, string> = { pck: 'packung', pkt: 'packung', bd: 'bund' }
const canonicalUnit = (u: string): string => UNIT_ALIASES[u] ?? u

// NOTE: simple fractions ("1/2 Apfel") are not parsed — the "/2" stays in the
// name and the user corrects it in the review UI. Decimal qty ("0,5") works.
const NUM = String.raw`(\d+(?:[.,]\d+)?)`
const LEADING = new RegExp(`^${NUM}\\s*([a-zà-ÿ]+)?\\s*(.*)$`, 'i')
const TRAILING = new RegExp(`^(.*?)\\s+${NUM}\\s*([a-zà-ÿ]+)?\\s*$`, 'i')

const num = (s: string): number => parseFloat(s.replace(',', '.'))

// Parenthetical asides are alternatives/notes ("(Honig, Ahornsirup)", "(alternativ …)"),
// not part of the product name — drop them before searching.
const stripParens = (s: string): string => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

const isBareNumber = (s: string): boolean => /^\d+(?:[.,]\d+)?$/.test(s)
const isBareUnit = (s: string): boolean => KNOWN_UNITS.has(s.toLowerCase())

// Some recipe sites render "150 / g / Heidelbeeren" as separate elements, so a
// copy-paste arrives with the quantity, unit and name on their own lines. Re-join
// a bare-number line (and an optional following bare-unit line) with the next
// content line so "150\ng\nHeidelbeeren" becomes "150 g Heidelbeeren".
function recombineVertical(rawLines: string[]): string[] {
  const out: string[] = []
  let prefix = ''
  for (const raw of rawLines) {
    const line = raw.trim()
    if (line === '') continue
    if (isBareNumber(line)) {
      if (prefix) out.push(prefix) // flush a dangling number (parseLine drops it)
      prefix = line
    } else if (isBareUnit(line)) {
      if (prefix) prefix = `${prefix} ${line}`
      // a bare unit with no pending quantity is paste noise — drop it
    } else {
      out.push(prefix ? `${prefix} ${line}` : line)
      prefix = ''
    }
  }
  if (prefix) out.push(prefix)
  return out
}

// Splits one line on top-level commas/semicolons; commas inside parentheses
// stay put so "(Honig, Ahornsirup, …)" is not torn apart, and a comma BETWEEN
// DIGITS is a German decimal ("Joghurt 3,5% Fett"), not a list separator.
function splitTopLevel(line: string): string[] {
  const parts: string[] = []
  let buf = ''
  let depth = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    else if ((ch === ',' || ch === ';') && depth === 0) {
      const isDecimalComma =
        ch === ',' && /\d/.test(line[i - 1] ?? '') && /\d/.test(line[i + 1] ?? '')
      if (!isDecimalComma) {
        parts.push(buf)
        buf = ''
        continue
      }
    }
    buf += ch
  }
  parts.push(buf)
  return parts
}

// German fraction spellings ("halbe Spitzpaprika", "½ Zitrone", "1/2 TL").
const FRACTIONS: [RegExp, number][] = [
  [/^(?:eine?\s+)?halbe[rsn]?\s+/i, 0.5],
  [/^(?:ein\s+)?viertel\s+/i, 0.25],
  [/^(?:ein\s+)?dreiviertel\s+/i, 0.75],
  [/^½\s*/, 0.5],
  [/^¼\s*/, 0.25],
  [/^¾\s*/, 0.75],
  [/^1\/2\s+/, 0.5],
  [/^1\/4\s+/, 0.25],
  [/^3\/4\s+/, 0.75],
]

export function parseLine(raw: string): ParsedLine {
  const chunk = stripParens(raw.trim())

  for (const [pattern, qty] of FRACTIONS) {
    const match = pattern.exec(chunk)
    if (match) {
      const rest = chunk.slice(match[0].length).trim()
      // optional unit word right after the fraction ("1/2 TL Honig")
      const unitMatch = /^([a-zà-ÿ]+)\s+(.+)$/i.exec(rest)
      if (unitMatch && KNOWN_UNITS.has(unitMatch[1]!.toLowerCase())) {
        return { raw, qty, unit: canonicalUnit(unitMatch[1]!.toLowerCase()), name: unitMatch[2]!.trim() }
      }
      return { raw, qty, unit: null, name: rest }
    }
  }

  const lead = LEADING.exec(chunk)
  if (lead) {
    const n = lead[1]!
    const word = (lead[2] ?? '').toLowerCase()
    const rest = (lead[3] ?? '').trim()
    if (word === 'x') {
      // count multiplier, e.g. "2x Brötchen"
      return { raw, qty: num(n), unit: null, name: rest }
    }
    if (word && KNOWN_UNITS.has(word)) {
      // A quantity+unit with no ingredient name (e.g. "200ml") leaves an empty
      // name; parseIngredients() drops such chunks.
      return { raw, qty: num(n), unit: canonicalUnit(word), name: rest }
    }
    return { raw, qty: num(n), unit: null, name: `${lead[2] ?? ''} ${rest}`.trim() }
  }

  const trail = TRAILING.exec(chunk)
  if (trail) {
    const name = (trail[1] ?? '').trim()
    const n = trail[2]!
    const word = (trail[3] ?? '').toLowerCase()
    if (name && (!word || KNOWN_UNITS.has(word))) {
      return { raw, qty: num(n), unit: word ? canonicalUnit(word) : null, name }
    }
  }

  return { raw, qty: null, unit: null, name: chunk }
}

export function parseIngredients(text: string): ParsedLine[] {
  return recombineVertical(text.split(/\r?\n/))
    .flatMap((line) => splitTopLevel(line))
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map(parseLine)
    .filter((l) => l.name.length > 0)
}
