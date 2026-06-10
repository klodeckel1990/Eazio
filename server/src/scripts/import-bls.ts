// Imports the BLS seed (server/seeds/bls-4.0.json.gz, built by
// scripts/convert-bls.ts) into the foods table. Idempotent: rows are keyed
// bls:<code> and upserted, so re-running after a new BLS release just
// refreshes the data.
//
// Usage: node dist/scripts/import-bls.js [seed-path]   (or npx tsx src/scripts/import-bls.ts)

import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { DB } from '../db/client.js'
import { upsertSourcedFood, type NewFood } from '../modules/foods/foods.repo.js'
import { buildSearchTerms } from '../modules/foods/search-terms.js'
import { PIECE_SERVINGS } from '../modules/foods/piece-weights.js'

export interface BlsSeed {
  meta: { source: string; attribution: string; count: number }
  foods: { code: string; name: string; nutrients: Record<string, number> }[]
}

// EuroFIR component code → dedicated column (everything else → nutrientsJson).
const COLUMN_CODES = {
  ENERCC: 'kcal',
  PROT625: 'protein',
  FAT: 'fat',
  FASAT: 'saturatedFat',
  CHO: 'carbs',
  SUGAR: 'sugar',
  FIBT: 'fiber',
  NACL: 'salt',
  NA: 'sodium',
  ALC: 'alcohol',
} as const

export function readBlsSeed(seedPath: string): BlsSeed {
  return JSON.parse(gunzipSync(readFileSync(seedPath)).toString('utf8')) as BlsSeed
}

export function importBlsSeed(db: DB, seed: BlsSeed): { imported: number; skipped: number } {
  let imported = 0
  let skipped = 0
  const now = Date.now()
  db.transaction((tx) => {
    for (const food of seed.foods) {
      const kcal = food.nutrients.ENERCC
      if (kcal === undefined) {
        skipped++
        continue
      }
      const rest: Record<string, number> = {}
      for (const [code, value] of Object.entries(food.nutrients)) {
        if (!(code in COLUMN_CODES)) rest[code] = value
      }
      const row: NewFood = {
        id: `bls:${food.code}`,
        source: 'bls',
        sourceId: food.code,
        name: food.name,
        category: food.code[0] ?? null, // BLS Hauptgruppen-Buchstabe
        searchTerms: buildSearchTerms(food.name),
        baseUnit: 'g',
        kcal,
        protein: food.nutrients.PROT625 ?? null,
        fat: food.nutrients.FAT ?? null,
        saturatedFat: food.nutrients.FASAT ?? null,
        carbs: food.nutrients.CHO ?? null,
        sugar: food.nutrients.SUGAR ?? null,
        fiber: food.nutrients.FIBT ?? null,
        salt: food.nutrients.NACL ?? null,
        sodium: food.nutrients.NA ?? null,
        alcohol: food.nutrients.ALC ?? null,
        nutrientsJson: JSON.stringify(rest),
        servingsJson: PIECE_SERVINGS[food.name] ? JSON.stringify(PIECE_SERVINGS[food.name]) : null,
        createdAt: now,
        updatedAt: now,
      }
      upsertSourcedFood(tx as unknown as DB, row)
      imported++
    }
  })
  return { imported, skipped }
}

const DEFAULT_SEED = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../seeds/bls-4.0.json.gz',
)

async function main(): Promise<void> {
  const { env } = await import('../config/env.js')
  const { createDb, ensureDbDir, runMigrations } = await import('../db/client.js')
  const seedPath = process.argv[2] ?? DEFAULT_SEED
  const seed = readBlsSeed(seedPath)
  ensureDbDir(env.DATABASE_PATH)
  const { db, sqlite } = createDb(env.DATABASE_PATH)
  runMigrations(db)
  const { imported, skipped } = importBlsSeed(db, seed)
  sqlite.close()
  console.log(`BLS import done: ${imported} foods upserted, ${skipped} skipped (${seed.meta.source})`)
  console.log(`Attribution: ${seed.meta.attribution}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
