// Dev-only converter: BLS 4.0 data xlsx → compact gzipped JSON seed committed
// to the repo (server/seeds/bls-4.0.json.gz). The runtime import script reads
// the seed, so the prod image needs neither the 14 MB xlsx nor the xlsx parser.
//
// Usage: npx tsx scripts/convert-bls.ts /path/to/BLS_4_0_Daten_2025_DE.xlsx
//
// Sheet layout (verified against the 2025-12 download): row 0 is the header
// ["BLS Code", "Lebensmittelbezeichnung", "Food name", then per nutrient a
// triplet of value / Datenherkunft / Referenz]. Value headers start with the
// EuroFIR component code, e.g. "ENERCC Energie (Kilokalorien) [kcal/100g]".

import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'

const xlsxPath = process.argv[2]
if (!xlsxPath) {
  console.error('usage: tsx scripts/convert-bls.ts <BLS_4_0_Daten_2025_DE.xlsx>')
  process.exit(1)
}

const wb = XLSX.read(readFileSync(xlsxPath), { type: 'buffer' })
const sheetName = wb.SheetNames[0]!
const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(wb.Sheets[sheetName]!, {
  header: 1,
})

const header = rows[0]!
if (header[0] !== 'BLS Code' || header[1] !== 'Lebensmittelbezeichnung') {
  console.error('unexpected sheet layout — header:', header.slice(0, 4))
  process.exit(1)
}

// Nutrient value columns: every 3rd column starting at index 3.
const nutrientCols: { col: number; code: string }[] = []
for (let col = 3; col < header.length; col += 3) {
  const code = String(header[col] ?? '').split(' ')[0]!
  if (code) nutrientCols.push({ col, code })
}

interface SeedFood {
  code: string
  name: string
  nutrients: Record<string, number>
}

const foods: SeedFood[] = []
let skippedValues = 0
for (let i = 1; i < rows.length; i++) {
  const row = rows[i]!
  const code = String(row[0] ?? '').trim()
  const name = String(row[1] ?? '').trim()
  if (!code || !name) continue
  const nutrients: Record<string, number> = {}
  for (const { col, code: nCode } of nutrientCols) {
    const v = row[col]
    if (typeof v === 'number' && Number.isFinite(v)) nutrients[nCode] = v
    // TR = Spuren, <LOD/<LOQ = unter Nachweis-/Bestimmungsgrenze → effektiv 0.
    else if (v === 'TR' || v === '<LOD' || v === '<LOQ' || v === '<LOD or <LOQ') nutrients[nCode] = 0
    else if (v !== undefined && v !== '' && v !== '-') skippedValues++
  }
  foods.push({ code, name, nutrients })
}

const seed = {
  meta: {
    source: 'BLS 4.0 (2025)',
    license: 'CC BY 4.0',
    attribution:
      'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 - Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0',
    nutrientCodes: nutrientCols.length,
    count: foods.length,
  },
  foods,
}

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '../seeds')
mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'bls-4.0.json.gz')
writeFileSync(outPath, gzipSync(Buffer.from(JSON.stringify(seed)), { level: 9 }))
console.log(
  `wrote ${outPath}: ${foods.length} foods, ${nutrientCols.length} nutrient codes, ${skippedValues} non-numeric values skipped`,
)
