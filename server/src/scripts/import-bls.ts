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
import { upsertCachedMatch, upsertSourcedFood, type NewFood } from '../modules/foods/foods.repo.js'
import { buildSearchTerms } from '../modules/foods/search-terms.js'
import { PIECE_SERVINGS } from '../modules/foods/piece-weights.js'

// Deterministic match-cache seeds for staples: core terms must never depend
// on FTS ranking or an AI pick. Keys are normalized query names, values are
// EXACT BLS names (resolved to ids after import).
const STAPLE_MATCHES: Record<string, string> = {
  milch: 'Milch fettarm, frisch, 1,5 % Fett, pasteurisiert', // BLS 4.0 hat keine Vollmilch
  vollmilch: 'Milch fettarm, frisch, 1,5 % Fett, pasteurisiert',
  kuhmilch: 'Milch fettarm, frisch, 1,5 % Fett, pasteurisiert',
  ei: 'Hühnerei roh',
  eier: 'Hühnerei roh',
  mehl: 'Weizen Mehl, Type 405',
  zucker: 'Zucker weiß (Raffinadezucker/Weißzucker)',
  butter: 'Butter mild gesäuert',
  joghurt: 'Joghurt mild, mind. 3,5 % Fett',
  haferflocken: 'Hafer Flocken',
  milchreis: 'Milchreis gesüßt, mit Milch 3,5 % Fett',
  // Audit einfachkochen.de: Grundzutaten, deren BLS-Name anders heißt
  wasser: 'Trinkwasser',
  sahne: 'Schlagsahne mind. 30 % Fett',
  schlagsahne: 'Schlagsahne mind. 30 % Fett',
  essig: 'Branntweinessig',
  pilz: 'Champignon roh',
  pilze: 'Champignon roh',
  champignon: 'Champignon roh',
  champignons: 'Champignon roh',
  hackfleisch: 'Rind/Schwein, Hackfleisch gemischt, roh',
  schweinehack: 'Schwein Hackfleisch, roh',
  schweinehackfleisch: 'Schwein Hackfleisch, roh',
  rinderhack: 'Rind Hackfleisch, roh',
  rinderhackfleisch: 'Rind Hackfleisch, roh',
  knoblauchzehe: 'Knoblauch roh',
  knoblauchzehen: 'Knoblauch roh',
  pflanzendrink: 'Haferdrink ungesüßt',
  kuverture: 'Zartbitter-/Halbbitter-Kuvertüre', // normalizeName: ü→u
  zartbitterkuverture: 'Zartbitter-/Halbbitter-Kuvertüre',
  hefe: 'Backhefe frisch (Frischbackhefe)',
  trockenhefe: 'Backhefe getrocknet (Trockenbackhefe)',
  frischkase: 'Frischkäsezubereitung Natur, mind. 60 % Fett i. Tr.',
  doppelrahmfrischkase: 'Frischkäsezubereitung Natur, mind. 60 % Fett i. Tr.',
  chili: 'Pfefferschote rot, roh',
  chilischote: 'Pfefferschote rot, roh',
  // Audit v2 (Top-10-Rezeptseiten)
  'rote linsen': 'Linse rot reif',
  linsen: 'Linse reif',
  toastbrot: 'Weizentoastbrot/Buttertoastbrot',
  schokoraspel: 'Zartbitter-/Halbbitterschokolade',
  zartbitterschokolade: 'Zartbitter-/Halbbitterschokolade',
  vollmilchschokolade: 'Vollmilchschokolade',
  salatblatt: 'Kopfsalat roh',
  'salatblatter': 'Kopfsalat roh', // normalizeName: ä→a
  blattspinat: 'Spinat roh',
  spinat: 'Spinat roh',
  naturjoghurt: 'Joghurt mild, mind. 3,5 % Fett',
  kidneybohnen: 'Kidneybohne reif, Konserve, abgetropft',
  wirsingkohl: 'Wirsing roh',
  wirsing: 'Wirsing roh',
  kartoffel: 'Kartoffel geschält, roh',
  kartoffeln: 'Kartoffel geschält, roh',
  lammfleisch: 'Lamm Bug/Schulter, roh',
  zuckerschoten: 'Zuckererbse roh',
  zuckerschote: 'Zuckererbse roh',
  pistazienkerne: 'Pistazie',
  pistazien: 'Pistazie',
  weissweinessig: 'Weinessig',
  basmatireis: 'Reis parboiled, poliert, roh',
  // Audit v3
  nudel: 'Teigwaren eifrei, roh',
  nudeln: 'Teigwaren eifrei, roh',
  pasta: 'Teigwaren eifrei, roh',
  spaghetti: 'Teigwaren eifrei, roh',
  fusilli: 'Teigwaren eifrei, roh',
  penne: 'Teigwaren eifrei, roh',
  lachs: 'Lachs roh',
  lachsfilet: 'Lachs roh',
  lachskotelett: 'Lachs roh',
  rinderfilet: 'Rind Filet/Lende, roh',
  schweinebauch: 'Schwein Bauch (wie gewachsen) roh',
  brokkoli: 'Broccoli roh',
  'brauner zucker': 'Zucker braun (Kandisfarin/Rohzucker)',
  vanillesosse: 'Vanillesauce',
  vanillesauce: 'Vanillesauce',
  'gekochter schinken': 'Schwein Kochschinken, Kochpökelware',
  schinken: 'Schwein Kochschinken, Kochpökelware',
  sojasauce: 'Sojasauce/Sojasoße',
  sojasosse: 'Sojasauce/Sojasoße',
  jasminreis: 'Reis poliert, roh',
  limoncello: 'Fruchtaromalikör',
  // Audit v4
  rice: 'Reis poliert, roh',
  'white rice': 'Reis poliert, roh',
  reis: 'Reis poliert, roh',
  erbsen: 'Erbse grün, tiefgefroren',
  'tk-erbsen': 'Erbse grün, tiefgefroren',
  peas: 'Erbse grün, tiefgefroren',
  senf: 'Senf mittelscharf',
  mustard: 'Senf mittelscharf',
  paniermehl: 'Paniermehl/Semmelbrösel/Semmelmehl',
  semmelbrosel: 'Paniermehl/Semmelbrösel/Semmelmehl',
  'bread crumbs': 'Paniermehl/Semmelbrösel/Semmelmehl',
  fettuccine: 'Teigwaren eifrei, roh',
  tagliatelle: 'Teigwaren eifrei, roh',
  bandnudeln: 'Teigwaren eifrei, roh',
  kirschen: 'Süßkirsche roh',
  kirsche: 'Süßkirsche roh',
  krauterseitlinge: 'Austernpilz roh',
  krauterseitling: 'Austernpilz roh',
  schweinefilet: 'Schwein Filet/Lende, roh',
  mandelkerne: 'Mandel süß',
  mandeln: 'Mandel süß',
  feta: 'Feta mind. 45 % Fett i. Tr.',
  'feta cheese': 'Feta mind. 45 % Fett i. Tr.',
  pecans: 'Pekannuss',
  pekannusse: 'Pekannuss',
  pekannusskerne: 'Pekannuss',
  kirschwasser: 'Obstbrand/Obstwasser',
  // Audit v5
  sellerie: 'Knollensellerie roh',
  stangensellerie: 'Bleichsellerie roh',
  staudensellerie: 'Bleichsellerie roh',
  celery: 'Bleichsellerie roh',
  'chicken breast': 'Hähnchen Brustfilet, roh',
  haehnchenbrust: 'Hähnchen Brustfilet, roh',
  'hahnchenbrust': 'Hähnchen Brustfilet, roh',
  huhnerbrust: 'Hähnchen Brustfilet, roh',
  'vegetable oil': 'Rapsöl/Rüböl',
  'unsalted butter': 'Butter mild gesäuert',
  yeast: 'Backhefe getrocknet (Trockenbackhefe)',
  'instant yeast': 'Backhefe getrocknet (Trockenbackhefe)',
  himbeergeist: 'Obstbrand/Obstwasser',
  filoteig: 'Blätterteig eifrei, roh',
  filoteigplatten: 'Blätterteig eifrei, roh',
  lammkarree: 'Lamm Kotelett, roh',
  bratwurstbrat: 'Bratwurst-Grundbrät',
  goudakase: 'Gouda 48 % Fett i. Tr.',
  gouda: 'Gouda 48 % Fett i. Tr.',
  kokosraspel: 'Kokos Fruchtfleisch, geraspelt, getrocknet',
  kokosraspeln: 'Kokos Fruchtfleisch, geraspelt, getrocknet',
  kokosflocken: 'Kokos Fruchtfleisch, geraspelt, getrocknet',
  gulasch: 'Rind Gulasch (Bug) roh',
  rindergulasch: 'Rind Gulasch (Bug) roh',
  'beef stew meat': 'Rind Gulasch (Bug) roh',
  'stew meat': 'Rind Gulasch (Bug) roh',
  hirschgulasch: 'Hirsch Fleisch, roh',
  'griechischer joghurt': 'Sahnejoghurt mind. 10 % Fett',
  tahini: 'Tahin (Sesammus)',
  tahin: 'Tahin (Sesammus)',
  rinderbruhe: 'Rindfleischbrühe Konserve',
  'beef broth': 'Rindfleischbrühe Konserve',
  riesling: 'Weißwein trocken',
  baguette: 'Weizenbaguette',
  baguettescheiben: 'Weizenbaguette',
  rauke: 'Rucola roh',
  sojahack: 'Sojaschnetzel/Sojagranulat, texturiert, trocken',
  mungobohnensprossen: 'Mungbohnensprossen/Mungbohnenkeimlinge, roh',
  rucola: 'Rucola roh',
  'coconut oil': 'Kokosöl',
  'pinto beans': 'Kidneybohne reif, Konserve, abgetropft',
  kokosol: 'Kokosöl',
  raucherbauch: 'Schwein Bauch (wie gewachsen) Rohpökelware',
  // englische Grundbegriffe (Allrecipes/Serious Eats/Cookpad)
  flour: 'Weizen Mehl, Type 405',
  sugar: 'Zucker weiß (Raffinadezucker/Weißzucker)',
  egg: 'Hühnerei roh',
  eggs: 'Hühnerei roh',
  milk: 'Milch fettarm, frisch, 1,5 % Fett, pasteurisiert',
  water: 'Trinkwasser',
  onion: 'Speisezwiebel roh',
  onions: 'Speisezwiebel roh',
  garlic: 'Knoblauch roh',
  tomato: 'Tomate roh',
  tomatoes: 'Tomate roh',
  'ground beef': 'Rind Hackfleisch, roh',
  // "Öl" allein trifft im BLS nur Gerichte mit Öl im Namen
  ol: 'Rapsöl/Rüböl',
  oel: 'Rapsöl/Rüböl',
  speiseol: 'Rapsöl/Rüböl',
  speiseoel: 'Rapsöl/Rüböl',
  pflanzenol: 'Rapsöl/Rüböl',
  pflanzenoel: 'Rapsöl/Rüböl',
}

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
    // staple seeds: name → id lookup against what we just imported
    const byName = new Map(seed.foods.map((f) => [f.name, `bls:${f.code}`]))
    for (const [term, blsName] of Object.entries(STAPLE_MATCHES)) {
      const foodId = byName.get(blsName)
      if (foodId) upsertCachedMatch(tx as unknown as DB, term, foodId)
      else console.warn(`staple seed skipped, BLS name not found: ${blsName}`)
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
