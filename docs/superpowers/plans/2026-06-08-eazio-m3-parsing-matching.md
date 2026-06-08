# Eazio M3 — Parsing, Matching & Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` checkboxes.

**Goal:** An authenticated user POSTs free-text ingredients + (optional) a Yazio account; the server parses each line into `{qty, unit, name}`, searches Yazio for each, and returns per line the parsed amount (in grams where determinable) plus the top-10 product candidates (with raw nutrient values) and a preselected product — preferring a previously-learned alias.

**Architecture:** New pure modules `modules/parsing` (parser + units) and `modules/matching` (normalize + matcher), a `modules/learning` alias repo (read now; upsert used by M4), and `http/routes/match.routes.ts` wired into `buildApp`. Reuses M2: `getDefaultAccount`/`getAccount` + `buildYazioClient`. The matcher takes a small structural `SearchClient` interface so it is unit-testable without the real Yazio.

**Tech:** Fastify 5, zod v4, drizzle 0.45 (sync), Vitest. ESM NodeNext (`.js` suffixes).

**Reference:** spec + roadmap (verified Yazio search shape). NOTE energy unit: search `nutrients["energy.energy"]` is assumed **kcal** — to be visually verified against a real account later; the field is named `kcal` in our candidate.

## Reused interfaces
- `modules/accounts/accounts.repo.ts`: `getAccount(db,userId,id)`, `getDefaultAccount(db,userId)` → `AccountRecord | undefined`.
- `modules/yazio/client.ts`: `buildYazioClient(db, account)` → a `Yazio` (has `products.search({query,countries?,locales?})` returning `ProductSearchResult[]`).
- `db/schema.ts`: `aliases` table cols `{ id, userId, normalizedName, productId, defaultServing, defaultServingQuantity, defaultAmountG, hits, updatedAt }` (UNIQUE(userId, normalizedName)).
- `config/env.ts`: `env.YAZIO_COUNTRIES` ('DE'), `env.YAZIO_LOCALES` ('de_DE,de_US').
- `http/auth-guard.ts`: `requireAuth`. Test auth helper: bootstrap+login → SESSION_COOKIE.

## File structure (new)
```
server/src/modules/parsing/  parser.ts   parser.test.ts   units.ts   units.test.ts
server/src/modules/matching/ normalize.ts normalize.test.ts matcher.ts matcher.test.ts
server/src/modules/learning/ aliases.repo.ts  aliases.repo.test.ts
server/src/http/routes/      match.routes.ts  match.routes.test.ts
```

---

### Task 1: Free-text parser

**Files:** `modules/parsing/parser.ts` + `parser.test.ts`.

- [ ] **Step 1: Failing test** — `parser.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { parseIngredients, parseLine } from './parser.js'

describe('ingredient parser', () => {
  it.each([
    ['80g Haferflocken', { qty: 80, unit: 'g', name: 'Haferflocken' }],
    ['200 ml Milch', { qty: 200, unit: 'ml', name: 'Milch' }],
    ['1 Banane', { qty: 1, unit: null, name: 'Banane' }],
    ['2 EL Öl', { qty: 2, unit: 'el', name: 'Öl' }],
    ['Haferflocken 80g', { qty: 80, unit: 'g', name: 'Haferflocken' }],
    ['1,5 kg Mehl', { qty: 1.5, unit: 'kg', name: 'Mehl' }],
    ['Milch', { qty: null, unit: null, name: 'Milch' }],
    ['2 Eier', { qty: 2, unit: null, name: 'Eier' }],
  ])('parses %s', (input, expected) => {
    const p = parseLine(input)
    expect({ qty: p.qty, unit: p.unit, name: p.name }).toEqual(expected)
  })

  it('splits multi-line and comma input, dropping blanks', () => {
    const lines = parseIngredients('80g Haferflocken\n200ml Milch, 1 Banane\n\n')
    expect(lines.map((l) => l.name)).toEqual(['Haferflocken', 'Milch', 'Banane'])
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/parsing/parser.test.ts`

- [ ] **Step 2: Implement** — `parser.ts`
```ts
export interface ParsedLine {
  raw: string
  qty: number | null
  unit: string | null // raw unit token, lowercased; null = no/unknown unit
  name: string
}

const KNOWN_UNITS = new Set([
  'g', 'gr', 'gramm', 'kg', 'ml', 'l',
  'stück', 'stk', 'stueck', 'portion', 'portionen', 'el', 'tl',
  'scheibe', 'scheiben', 'prise', 'prisen', 'becher', 'glas', 'dose', 'tasse',
])

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
    if (word && KNOWN_UNITS.has(word)) {
      return { raw, qty: num(n), unit: word, name: rest || word }
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
}
```
Run (PASS). Commit: `feat(server): free-text ingredient parser`

---

### Task 2: Unit → grams resolver

**Files:** `modules/parsing/units.ts` + `units.test.ts`.

- [ ] **Step 1: Failing test** — `units.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { resolveAmount } from './units.js'

describe('resolveAmount', () => {
  it('maps mass/volume units to grams', () => {
    expect(resolveAmount(80, 'g')).toEqual({ normalizedUnit: 'g', amountGrams: 80 })
    expect(resolveAmount(1.5, 'kg')).toEqual({ normalizedUnit: 'g', amountGrams: 1500 })
    expect(resolveAmount(200, 'ml')).toEqual({ normalizedUnit: 'ml', amountGrams: 200 })
    expect(resolveAmount(2, 'l')).toEqual({ normalizedUnit: 'ml', amountGrams: 2000 })
  })
  it('treats piece/unknown/none as a serving (grams resolved later)', () => {
    expect(resolveAmount(1, null)).toEqual({ normalizedUnit: 'serving', amountGrams: null })
    expect(resolveAmount(2, 'el')).toEqual({ normalizedUnit: 'serving', amountGrams: null })
    expect(resolveAmount(null, null)).toEqual({ normalizedUnit: 'serving', amountGrams: null })
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/parsing/units.test.ts`

- [ ] **Step 2: Implement** — `units.ts`
```ts
export type NormalizedUnit = 'g' | 'ml' | 'serving'

export interface ResolvedAmount {
  normalizedUnit: NormalizedUnit
  amountGrams: number | null // null for serving units (resolved in the UI)
}

const GRAM_UNITS: Record<string, number> = { g: 1, gr: 1, gramm: 1, kg: 1000 }
const ML_UNITS: Record<string, number> = { ml: 1, l: 1000 }

export function resolveAmount(qty: number | null, unit: string | null): ResolvedAmount {
  const q = qty ?? 1
  if (unit && unit in GRAM_UNITS) return { normalizedUnit: 'g', amountGrams: q * GRAM_UNITS[unit]! }
  if (unit && unit in ML_UNITS) return { normalizedUnit: 'ml', amountGrams: q * ML_UNITS[unit]! }
  return { normalizedUnit: 'serving', amountGrams: null }
}
```
Run (PASS). Commit: `feat(server): unit-to-grams resolver`

---

### Task 3: Name normalizer

**Files:** `modules/matching/normalize.ts` + `normalize.test.ts`.

- [ ] **Step 1: Failing test** — `normalize.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { normalizeName } from './normalize.js'

describe('normalizeName', () => {
  it('lowercases, strips accents, collapses whitespace', () => {
    expect(normalizeName('  Haferflocken ')).toBe('haferflocken')
    expect(normalizeName('Müsli   Crunchy')).toBe('musli crunchy')
    expect(normalizeName('Café')).toBe('cafe')
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/matching/normalize.test.ts`

- [ ] **Step 2: Implement** — `normalize.ts`
```ts
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
```
Run (PASS). Commit: `feat(server): ingredient name normalizer`

---

### Task 4: Aliases repository (learning store)

**Files:** `modules/learning/aliases.repo.ts` + `aliases.repo.test.ts`.

- [ ] **Step 1: Failing test** — `aliases.repo.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { getAlias, upsertAlias } from './aliases.repo.js'

describe('aliases repo', () => {
  it('inserts then updates (bumping hits) and is user-scoped', async () => {
    const db = createTestDb()
    const u1 = await createUser(db, 'u1', 'pw-123456')
    const u2 = await createUser(db, 'u2', 'pw-123456')

    expect(getAlias(db, u1.id, 'haferflocken')).toBeUndefined()

    upsertAlias(db, u1.id, 'haferflocken', { productId: 'p1', defaultAmountG: 80 })
    const a1 = getAlias(db, u1.id, 'haferflocken')!
    expect(a1.productId).toBe('p1')
    expect(a1.hits).toBe(1)

    upsertAlias(db, u1.id, 'haferflocken', { productId: 'p2' })
    const a2 = getAlias(db, u1.id, 'haferflocken')!
    expect(a2.productId).toBe('p2')
    expect(a2.hits).toBe(2)

    // u2 has its own namespace
    expect(getAlias(db, u2.id, 'haferflocken')).toBeUndefined()
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/learning/aliases.repo.test.ts`

- [ ] **Step 2: Implement** — `aliases.repo.ts`
```ts
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { aliases } from '../../db/schema.js'

export type AliasRecord = typeof aliases.$inferSelect

export interface AliasInput {
  productId: string
  defaultServing?: string | null
  defaultServingQuantity?: number | null
  defaultAmountG?: number | null
}

export function getAlias(db: DB, userId: string, normalizedName: string): AliasRecord | undefined {
  return db
    .select()
    .from(aliases)
    .where(and(eq(aliases.userId, userId), eq(aliases.normalizedName, normalizedName)))
    .get()
}

export function upsertAlias(
  db: DB,
  userId: string,
  normalizedName: string,
  input: AliasInput,
): void {
  const existing = getAlias(db, userId, normalizedName)
  const fields = {
    productId: input.productId,
    defaultServing: input.defaultServing ?? null,
    defaultServingQuantity: input.defaultServingQuantity ?? null,
    defaultAmountG: input.defaultAmountG ?? null,
    updatedAt: Date.now(),
  }
  if (existing) {
    db.update(aliases)
      .set({ ...fields, hits: existing.hits + 1 })
      .where(eq(aliases.id, existing.id))
      .run()
  } else {
    db.insert(aliases)
      .values({ id: randomUUID(), userId, normalizedName, hits: 1, ...fields })
      .run()
  }
}
```
Run (PASS). Commit: `feat(server): alias learning repository`

---

### Task 5: Matcher

**Files:** `modules/matching/matcher.ts` + `matcher.test.ts`.

- [ ] **Step 1: Failing test** — `matcher.test.ts`
```ts
import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { upsertAlias } from '../learning/aliases.repo.js'
import { matchText, type SearchClient } from './matcher.js'

function product(id: string, name: string, extra: Partial<Record<string, number>> = {}) {
  return {
    product_id: id, name, producer: 'ACME', is_verified: true,
    base_unit: 'g', amount: 100, serving: 'portion', serving_quantity: 1,
    nutrients: {
      'energy.energy': extra.energy ?? 350, 'nutrient.carb': 60,
      'nutrient.protein': 12, 'nutrient.fat': 7,
    },
  }
}

function clientReturning(results: ReturnType<typeof product>[]): SearchClient {
  return { products: { search: vi.fn().mockResolvedValue(results) } }
}

describe('matchText', () => {
  it('parses, searches, and maps top-10 candidates with grams for g units', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    const client = clientReturning([product('p1', 'Haferflocken'), product('p2', 'Haferflocken Bio')])

    const lines = await matchText(client, db, user.id, '80g Haferflocken')
    expect(lines).toHaveLength(1)
    const l = lines[0]!
    expect(l.unit).toBe('g')
    expect(l.amountGrams).toBe(80)
    expect(l.candidates).toHaveLength(2)
    expect(l.candidates[0]).toMatchObject({
      productId: 'p1', baseUnit: 'g', referenceAmount: 100,
      nutrientsPerReference: { kcal: 350, carb: 60, protein: 12, fat: 7 },
    })
    expect(l.selectedProductId).toBe('p1') // best score (first) by default
  })

  it('preselects and fronts a learned alias product', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    upsertAlias(db, user.id, 'haferflocken', { productId: 'p2' })
    const client = clientReturning([product('p1', 'Haferflocken'), product('p2', 'Haferflocken Bio')])

    const lines = await matchText(client, db, user.id, 'Haferflocken')
    const l = lines[0]!
    expect(l.selectedProductId).toBe('p2')
    expect(l.candidates[0]!.productId).toBe('p2') // moved to front
  })

  it('marks serving units with null grams', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    const lines = await matchText(clientReturning([product('p1', 'Banane')]), db, user.id, '1 Banane')
    expect(lines[0]!.unit).toBe('serving')
    expect(lines[0]!.amountGrams).toBeNull()
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/matching/matcher.test.ts`

- [ ] **Step 2: Implement** — `matcher.ts`
```ts
import type { DB } from '../../db/client.js'
import { env } from '../../config/env.js'
import { parseIngredients } from '../parsing/parser.js'
import { resolveAmount, type NormalizedUnit } from '../parsing/units.js'
import { normalizeName } from './normalize.js'
import { getAlias } from '../learning/aliases.repo.js'

export interface SearchResult {
  product_id: string
  name: string
  producer: string
  is_verified: boolean
  base_unit: string
  amount: number
  serving: string
  serving_quantity: number
  nutrients: Record<string, number>
}

/** Minimal structural subset of the Yazio client the matcher needs (testable). */
export interface SearchClient {
  products: {
    search: (opts: { query: string; countries?: string[]; locales?: string[] }) => Promise<SearchResult[]>
  }
}

export interface ProductCandidate {
  productId: string
  name: string
  producer: string
  isVerified: boolean
  baseUnit: string
  referenceAmount: number
  serving: string
  servingQuantity: number
  nutrientsPerReference: { kcal: number; carb: number; protein: number; fat: number }
}

export interface MatchedLine {
  raw: string
  name: string
  qty: number | null
  unit: NormalizedUnit
  amountGrams: number | null
  candidates: ProductCandidate[]
  selectedProductId: string | null
}

function toCandidate(r: SearchResult): ProductCandidate {
  const n = r.nutrients
  return {
    productId: r.product_id,
    name: r.name,
    producer: r.producer,
    isVerified: r.is_verified,
    baseUnit: r.base_unit,
    referenceAmount: r.amount,
    serving: r.serving,
    servingQuantity: r.serving_quantity,
    nutrientsPerReference: {
      kcal: n['energy.energy'] ?? 0,
      carb: n['nutrient.carb'] ?? 0,
      protein: n['nutrient.protein'] ?? 0,
      fat: n['nutrient.fat'] ?? 0,
    },
  }
}

const split = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean)

export async function matchText(
  client: SearchClient,
  db: DB,
  userId: string,
  text: string,
): Promise<MatchedLine[]> {
  const countries = split(env.YAZIO_COUNTRIES)
  const locales = split(env.YAZIO_LOCALES)
  const out: MatchedLine[] = []

  for (const line of parseIngredients(text)) {
    const { normalizedUnit, amountGrams } = resolveAmount(line.qty, line.unit)
    const results = await client.products.search({ query: line.name, countries, locales })
    let candidates = results.slice(0, 10).map(toCandidate)

    let selectedProductId = candidates[0]?.productId ?? null
    const alias = getAlias(db, userId, normalizeName(line.name))
    if (alias) {
      const idx = candidates.findIndex((c) => c.productId === alias.productId)
      if (idx >= 0) {
        const [pick] = candidates.splice(idx, 1)
        candidates = [pick!, ...candidates]
        selectedProductId = pick!.productId
      }
    }

    out.push({
      raw: line.raw,
      name: line.name,
      qty: line.qty,
      unit: normalizedUnit,
      amountGrams,
      candidates,
      selectedProductId,
    })
  }
  return out
}
```
Run (PASS). Commit: `feat(server): ingredient matcher with alias preselection`

---

### Task 6: /api/match route + wire into app

**Files:** `http/routes/match.routes.ts` + `match.routes.test.ts`; modify `app.ts`.

- [ ] **Step 1: Failing test** — `match.routes.test.ts`
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const search = vi.fn()
vi.mock('../../modules/yazio/client.js', () => ({
  buildYazioClient: () => ({ products: { search } }),
  verifyCredentials: vi.fn(),
}))

import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'
import { createAccount } from '../../modules/accounts/accounts.repo.js'

const BOOTSTRAP = 'test-bootstrap-token'

async function authed() {
  const db = createTestDb()
  const app = buildApp(db)
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { token: BOOTSTRAP, username: 'jens', password: 'pw-123456' } })
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'jens', password: 'pw-123456' } })
  const cookie = `${SESSION_COOKIE}=${login.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`
  // resolve userId via /me
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
  return { db, app, cookie, userId: me.json().id as string }
}

beforeEach(() => search.mockReset())

describe('POST /api/match', () => {
  it('401 without auth', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'POST', url: '/api/match', payload: { text: 'x' } })
    expect(res.statusCode).toBe(401)
  })

  it('409 when the user has no account', async () => {
    const { app, cookie } = await authed()
    const res = await app.inject({ method: 'POST', url: '/api/match', headers: { cookie }, payload: { text: '80g Haferflocken' } })
    expect(res.statusCode).toBe(409)
  })

  it('matches against the default account', async () => {
    const { db, app, cookie, userId } = await authed()
    createAccount(db, userId, 'Me', { username: 'me@x.de', password: 'secret' })
    search.mockResolvedValue([
      { product_id: 'p1', name: 'Haferflocken', producer: 'ACME', is_verified: true, base_unit: 'g', amount: 100, serving: 'portion', serving_quantity: 1, nutrients: { 'energy.energy': 350, 'nutrient.carb': 60, 'nutrient.protein': 12, 'nutrient.fat': 7 } },
    ])
    const res = await app.inject({ method: 'POST', url: '/api/match', headers: { cookie }, payload: { text: '80g Haferflocken' } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.lines).toHaveLength(1)
    expect(body.lines[0].amountGrams).toBe(80)
    expect(body.lines[0].candidates[0].productId).toBe('p1')
  })
})
```
Run (FAIL): `npm run test -w server -- src/http/routes/match.routes.test.ts`

- [ ] **Step 2: Implement** — `match.routes.ts`
```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getAccount, getDefaultAccount } from '../../modules/accounts/accounts.repo.js'
import { buildYazioClient } from '../../modules/yazio/client.js'
import { matchText, type SearchClient } from '../../modules/matching/matcher.js'

const MatchSchema = z.object({
  text: z.string().min(1).max(5000),
  accountId: z.string().min(1).optional(),
})

export function registerMatchRoutes(app: FastifyInstance, db: DB): void {
  app.post('/api/match', { preHandler: requireAuth }, async (req, reply) => {
    const body = MatchSchema.parse(req.body)
    const userId = req.user!.id
    const account = body.accountId
      ? getAccount(db, userId, body.accountId)
      : getDefaultAccount(db, userId)
    if (!account) return reply.status(409).send({ error: 'no_account' })

    const client = buildYazioClient(db, account) as unknown as SearchClient
    const lines = await matchText(client, db, userId, body.text)
    return { accountId: account.id, lines }
  })
}
```
> The `as unknown as SearchClient` bridges the real `Yazio` type to the matcher's minimal structural interface. If the structural types already align, drop the cast; do NOT use `any`.

- [ ] **Step 3: Wire into `app.ts`** — add import and registration after `registerAccountRoutes(app, db)`:
```ts
import { registerMatchRoutes } from './http/routes/match.routes.js'
```
```ts
  registerMatchRoutes(app, db)
```

Run (PASS) the route test + full suite. Commit: `feat(server): /api/match route + wiring`

---

## Self-Review (M3 scope)
- Free-text → parsed lines (DE patterns, leading/trailing qty, units, commas/newlines) → Task 1. ✅
- Units → grams (g/kg/ml/l), serving for piece/unknown → Task 2. ✅
- Name normalization for alias keys → Task 3. ✅
- Alias read (preselect) + upsert (used by M4) → Tasks 4,5. ✅
- Per-line search → top-10 candidates with raw nutrients + reference amount (frontend scales to chosen grams) → Task 5. ✅
- Auth-gated endpoint resolving default/selected account → builds token-cached client → returns matched lines; 409 when no account → Task 6. ✅

**Forward (M4):** the matched line + chosen candidate + amountGrams feed the consumed-item builder; `upsertAlias` is called on submit to learn the user's correction; daytime resolver + logging + presets are M4.
