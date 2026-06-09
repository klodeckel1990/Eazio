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

// Parenthetical asides are alternatives/notes ("(Honig, Ahornsirup)", "(alternativ …)"),
// not part of the product name — drop them before searching.
const stripParens = (s: string): string => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

// Split into ingredient chunks on newlines, semicolons and TOP-LEVEL commas only;
// commas inside parentheses stay put so "(Honig, Ahornsirup, …)" is not torn apart.
function splitChunks(text: string): string[] {
  const chunks: string[] = []
  let buf = ''
  let depth = 0
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    else if (ch === '\n' || ch === ';' || (ch === ',' && depth === 0)) {
      chunks.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  chunks.push(buf)
  return chunks
}

export function parseLine(raw: string): ParsedLine {
  const chunk = stripParens(raw.trim())

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
  return splitChunks(text)
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .map(parseLine)
    .filter((l) => l.name.length > 0)
}
