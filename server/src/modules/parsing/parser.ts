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
])

// NOTE: simple fractions ("1/2 Apfel") are not parsed — the "/2" stays in the
// name and the user corrects it in the review UI. Decimal qty ("0,5") works.
const NUM = String.raw`(\d+(?:[.,]\d+)?)`
const LEADING = new RegExp(`^${NUM}\\s*([a-zà-ÿ]+)?\\s*(.*)$`, 'i')
const TRAILING = new RegExp(`^(.*?)\\s+${NUM}\\s*([a-zà-ÿ]+)?\\s*$`, 'i')

const num = (s: string): number => parseFloat(s.replace(',', '.'))

export function parseLine(raw: string): ParsedLine {
  const chunk = raw.trim()

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
      return { raw, qty: num(n), unit: word, name: rest }
    }
    return { raw, qty: num(n), unit: null, name: `${lead[2] ?? ''} ${rest}`.trim() }
  }

  const trail = TRAILING.exec(chunk)
  if (trail) {
    const name = (trail[1] ?? '').trim()
    const n = trail[2]!
    const word = (trail[3] ?? '').toLowerCase()
    if (name && (!word || KNOWN_UNITS.has(word))) {
      return { raw, qty: num(n), unit: word || null, name }
    }
  }

  return { raw, qty: null, unit: null, name: chunk }
}

export function parseIngredients(text: string): ParsedLine[] {
  return text
    .split(/[\n,;]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map(parseLine)
    .filter((l) => l.name.length > 0)
}
