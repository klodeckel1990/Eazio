# Eazio M4 — Logging, Presets & Daytime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` checkboxes.

**Goal:** Submit corrected ingredient lines to a Yazio account as consumed items (one per line, same date+daytime, with client-generated UUIDs), recording a `log_event` for undo and learning the user's product choices as aliases. Daytime is auto-resolved from the current time in the configured TZ (overridable). Undo removes the logged items. Reusable corrected lists are saved/loaded as named presets.

**Architecture:** New modules `modules/meals` (daytime), `modules/logging` (consumed-item builder + log_events repo + log service), `modules/presets` (repo), plus `http/routes/log.routes.ts` and `http/routes/presets.routes.ts` wired into `buildApp`. Reuses M2 (`getAccount`/`buildYazioClient`), M3 (`upsertAlias`, `normalizeName`). The log service uses a small structural `LogClient` interface for testability.

**Tech:** Fastify 5, zod v4, drizzle 0.45 (sync, `db.transaction`), `Intl.DateTimeFormat` for TZ (no deps), Vitest with `vi.mock`. ESM NodeNext (`.js`).

## Verified Yazio facts
- `user.addConsumedItem(item)` flat: `{ id(uuid WE generate), product_id(uuid), date(YYYY-MM-DD), daytime, amount(number=grams), serving(string|null), serving_quantity(number|null) }` → `Promise<void>`. Either serving+serving_quantity both set, or both null.
- `user.removeConsumedItem(id)` → `Promise<void>` (the consumed-item id = the uuid we generated).
- daytime ∈ `breakfast|lunch|dinner|snack`.

## Reused interfaces
- `modules/accounts/accounts.repo.ts`: `getAccount(db,userId,id)`, `getDefaultAccount(db,userId)` → `AccountRecord`.
- `modules/yazio/client.ts`: `buildYazioClient(db, account)` → `Yazio` (has `user.addConsumedItem`/`removeConsumedItem`).
- `modules/learning/aliases.repo.ts`: `upsertAlias(db,userId,normalizedName,{productId,defaultAmountG?})`.
- `modules/matching/normalize.ts`: `normalizeName`.
- `db/schema.ts`: `logEvents` `{id,userId,yazioAccountId,date,daytime,status,itemsJson,consumedIdsJson,createdAt}`; `presets` `{id,userId,name,createdAt}` UNIQUE(userId,name); `presetItems` `{id,presetId(cascade),position,rawText,productId,serving,servingQuantity,amountG}`.
- `config/env.ts`: `env.TZ`. `http/auth-guard.ts`: `requireAuth`.

## File structure (new)
```
server/src/modules/meals/    daytime.ts   daytime.test.ts
server/src/modules/logging/  consumed-item.ts consumed-item.test.ts
                             log-events.repo.ts log-events.repo.test.ts
                             log.service.ts   log.service.test.ts
server/src/modules/presets/  presets.repo.ts  presets.repo.test.ts
server/src/http/routes/      log.routes.ts    log.routes.test.ts
                             presets.routes.ts presets.routes.test.ts
```

Conventions: ESM `.js`; drizzle sync; verify `npm run typecheck -w server` + `npm run test -w server` green at each task end. `noUncheckedIndexedAccess` ON.

---

### Task 1: Daytime resolver (TZ-aware)

**Files:** `modules/meals/daytime.ts` + `.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { resolveDaytime, dateInTz, hourInTz, type Daytime } from './daytime.js'

const at = (iso: string) => new Date(iso)

describe('daytime', () => {
  it('reads the hour and date in a timezone', () => {
    expect(hourInTz(at('2026-06-08T08:30:00Z'), 'UTC')).toBe(8)
    expect(dateInTz(at('2026-06-08T23:30:00Z'), 'UTC')).toBe('2026-06-08')
    // Tokyo is UTC+9 → next calendar day
    expect(dateInTz(at('2026-06-08T23:30:00Z'), 'Asia/Tokyo')).toBe('2026-06-09')
    expect(hourInTz(at('2026-06-08T00:00:00Z'), 'UTC')).toBe(0)
  })

  it('maps the hour to a daytime via default windows', () => {
    const d = (iso: string): Daytime => resolveDaytime(at(iso), 'UTC')
    expect(d('2026-06-08T08:00:00Z')).toBe('breakfast') // 5..11
    expect(d('2026-06-08T13:00:00Z')).toBe('lunch') // 11..15
    expect(d('2026-06-08T18:00:00Z')).toBe('dinner') // 15..21
    expect(d('2026-06-08T23:00:00Z')).toBe('snack')
    expect(d('2026-06-08T03:00:00Z')).toBe('snack')
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/meals/daytime.test.ts`

- [ ] **Step 2: Implement** — `daytime.ts`
```ts
export type Daytime = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface DaytimeWindows {
  breakfast: [number, number] // [startHour, endHour)
  lunch: [number, number]
  dinner: [number, number]
}

export const DEFAULT_WINDOWS: DaytimeWindows = {
  breakfast: [5, 11],
  lunch: [11, 15],
  dinner: [15, 21],
}

export function hourInTz(now: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  return parseInt(h, 10)
}

export function dateInTz(now: Date, tz: string): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function resolveDaytime(now: Date, tz: string, w: DaytimeWindows = DEFAULT_WINDOWS): Daytime {
  const h = hourInTz(now, tz)
  if (h >= w.breakfast[0] && h < w.breakfast[1]) return 'breakfast'
  if (h >= w.lunch[0] && h < w.lunch[1]) return 'lunch'
  if (h >= w.dinner[0] && h < w.dinner[1]) return 'dinner'
  return 'snack'
}

export const DAYTIMES: readonly Daytime[] = ['breakfast', 'lunch', 'dinner', 'snack']
```
Run (PASS). Commit: `feat(server): timezone-aware daytime resolver`

---

### Task 2: Consumed-item builder

**Files:** `modules/logging/consumed-item.ts` + `.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { buildConsumedItem } from './consumed-item.js'

describe('buildConsumedItem', () => {
  it('builds a gram-based item with a generated uuid and null serving', () => {
    const item = buildConsumedItem({ productId: 'p1', amountGrams: 80 }, '2026-06-08', 'breakfast')
    expect(item).toMatchObject({
      product_id: 'p1', date: '2026-06-08', daytime: 'breakfast',
      amount: 80, serving: null, serving_quantity: null,
    })
    expect(item.id).toMatch(/[0-9a-f-]{36}/)
  })

  it('passes serving info through when provided', () => {
    const item = buildConsumedItem(
      { productId: 'p1', amountGrams: 120, serving: 'portion', servingQuantity: 1 },
      '2026-06-08', 'lunch',
    )
    expect(item).toMatchObject({ serving: 'portion', serving_quantity: 1, amount: 120 })
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/logging/consumed-item.test.ts`

- [ ] **Step 2: Implement** — `consumed-item.ts`
```ts
import { randomUUID } from 'node:crypto'
import type { Daytime } from '../meals/daytime.js'

export interface LogItemInput {
  productId: string
  amountGrams: number
  serving?: string | null
  servingQuantity?: number | null
}

export interface ConsumedItem {
  id: string
  product_id: string
  date: string
  daytime: Daytime
  amount: number
  serving: string | null
  serving_quantity: number | null
}

/** Builds a Yazio consumed-item; the id (uuid) is generated here so we can later undo it. */
export function buildConsumedItem(input: LogItemInput, date: string, daytime: Daytime): ConsumedItem {
  return {
    id: randomUUID(),
    product_id: input.productId,
    date,
    daytime,
    amount: input.amountGrams,
    serving: input.serving ?? null,
    serving_quantity: input.servingQuantity ?? null,
  }
}
```
Run (PASS). Commit: `feat(server): consumed-item builder`

---

### Task 3: log_events repository

**Files:** `modules/logging/log-events.repo.ts` + `.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount } from '../accounts/accounts.repo.js'
import { createLogEvent, getLogEvent, markUndone } from './log-events.repo.js'

async function seed(db: ReturnType<typeof createTestDb>) {
  const user = await createUser(db, 'jens', 'pw-123456')
  const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret' })
  return { userId: user.id, accountId: acc.id }
}

describe('log-events repo', () => {
  it('creates, reads (user-scoped), and marks undone', async () => {
    const db = createTestDb()
    const { userId, accountId } = await seed(db)

    const id = createLogEvent(db, {
      userId, yazioAccountId: accountId, date: '2026-06-08', daytime: 'breakfast',
      status: 'logged', items: [{ productId: 'p1', amountGrams: 80, name: 'Haferflocken' }],
      consumedIds: ['c1', 'c2'],
    })
    expect(id).toMatch(/[0-9a-f-]{36}/)

    const ev = getLogEvent(db, userId, id)!
    expect(ev.status).toBe('logged')
    expect(JSON.parse(ev.consumedIdsJson!)).toEqual(['c1', 'c2'])

    // other user cannot read it
    expect(getLogEvent(db, 'someone-else', id)).toBeUndefined()

    expect(markUndone(db, userId, id)).toBe(true)
    expect(getLogEvent(db, userId, id)!.status).toBe('undone')
    expect(markUndone(db, 'someone-else', id)).toBe(false)
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/logging/log-events.repo.test.ts`

- [ ] **Step 2: Implement** — `log-events.repo.ts`
```ts
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { logEvents } from '../../db/schema.js'
import type { Daytime } from '../meals/daytime.js'

export type LogEventRecord = typeof logEvents.$inferSelect

export interface CreateLogEventInput {
  userId: string
  yazioAccountId: string
  date: string
  daytime: Daytime
  status: 'logged' | 'error'
  items: unknown
  consumedIds: string[]
}

export function createLogEvent(db: DB, input: CreateLogEventInput): string {
  const id = randomUUID()
  db.insert(logEvents)
    .values({
      id,
      userId: input.userId,
      yazioAccountId: input.yazioAccountId,
      date: input.date,
      daytime: input.daytime,
      status: input.status,
      itemsJson: JSON.stringify(input.items),
      consumedIdsJson: JSON.stringify(input.consumedIds),
      createdAt: Date.now(),
    })
    .run()
  return id
}

export function getLogEvent(db: DB, userId: string, id: string): LogEventRecord | undefined {
  return db
    .select()
    .from(logEvents)
    .where(and(eq(logEvents.id, id), eq(logEvents.userId, userId)))
    .get()
}

export function markUndone(db: DB, userId: string, id: string): boolean {
  if (!getLogEvent(db, userId, id)) return false
  db.update(logEvents)
    .set({ status: 'undone' })
    .where(and(eq(logEvents.id, id), eq(logEvents.userId, userId)))
    .run()
  return true
}
```
Run (PASS). Commit: `feat(server): log-events repository`

---

### Task 4: Log service (submit + undo + learning)

**Files:** `modules/logging/log.service.ts` + `.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount } from '../accounts/accounts.repo.js'
import { getAlias } from '../learning/aliases.repo.js'
import { submitLog, undoLog, type LogClient } from './log.service.js'

function fakeClient() {
  return {
    user: { addConsumedItem: vi.fn().mockResolvedValue(undefined), removeConsumedItem: vi.fn().mockResolvedValue(undefined) },
  }
}

async function seed(db: ReturnType<typeof createTestDb>) {
  const user = await createUser(db, 'jens', 'pw-123456')
  const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret' })
  return { userId: user.id, accountId: acc.id }
}

describe('log service', () => {
  it('logs each line, learns aliases, records the event', async () => {
    const db = createTestDb()
    const { userId, accountId } = await seed(db)
    const client = fakeClient()

    const res = await submitLog(client as unknown as LogClient, db, userId, accountId, {
      date: '2026-06-08', daytime: 'breakfast',
      lines: [
        { productId: 'p1', name: 'Haferflocken', amountGrams: 80 },
        { productId: 'p2', name: 'Milch', amountGrams: 200 },
      ],
    })

    expect(res.count).toBe(2)
    expect(client.user.addConsumedItem).toHaveBeenCalledTimes(2)
    expect(res.consumedIds).toHaveLength(2)
    // learned
    expect(getAlias(db, userId, 'haferflocken')?.productId).toBe('p1')
    expect(getAlias(db, userId, 'milch')?.productId).toBe('p2')
  })

  it('undo removes each consumed item and marks the event undone', async () => {
    const db = createTestDb()
    const { userId, accountId } = await seed(db)
    const client = fakeClient()

    const res = await submitLog(client as unknown as LogClient, db, userId, accountId, {
      date: '2026-06-08', daytime: 'lunch',
      lines: [{ productId: 'p1', name: 'Reis', amountGrams: 150 }],
    })

    expect(await undoLog(client as unknown as LogClient, db, userId, res.logId)).toBe(true)
    expect(client.user.removeConsumedItem).toHaveBeenCalledTimes(1)
    expect(client.user.removeConsumedItem).toHaveBeenCalledWith(res.consumedIds[0])
    // second undo is a no-op
    expect(await undoLog(client as unknown as LogClient, db, userId, res.logId)).toBe(false)
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/logging/log.service.test.ts`

- [ ] **Step 2: Implement** — `log.service.ts`
```ts
import type { DB } from '../../db/client.js'
import { normalizeName } from '../matching/normalize.js'
import { upsertAlias } from '../learning/aliases.repo.js'
import { buildConsumedItem, type ConsumedItem, type LogItemInput } from './consumed-item.js'
import { createLogEvent, getLogEvent, markUndone } from './log-events.repo.js'
import type { Daytime } from '../meals/daytime.js'

export interface LogClient {
  user: {
    addConsumedItem: (item: ConsumedItem) => Promise<void>
    removeConsumedItem: (id: string) => Promise<void>
  }
}

export interface SubmitLine extends LogItemInput {
  name: string
}

export interface SubmitInput {
  date: string
  daytime: Daytime
  lines: SubmitLine[]
}

export interface SubmitResult {
  logId: string
  consumedIds: string[]
  count: number
}

export async function submitLog(
  client: LogClient,
  db: DB,
  userId: string,
  accountId: string,
  input: SubmitInput,
): Promise<SubmitResult> {
  const consumedIds: string[] = []
  for (const line of input.lines) {
    const item = buildConsumedItem(line, input.date, input.daytime)
    await client.user.addConsumedItem(item)
    consumedIds.push(item.id)
    upsertAlias(db, userId, normalizeName(line.name), {
      productId: line.productId,
      defaultServing: line.serving ?? null,
      defaultServingQuantity: line.servingQuantity ?? null,
      defaultAmountG: line.amountGrams,
    })
  }
  const logId = createLogEvent(db, {
    userId,
    yazioAccountId: accountId,
    date: input.date,
    daytime: input.daytime,
    status: 'logged',
    items: input.lines,
    consumedIds,
  })
  return { logId, consumedIds, count: consumedIds.length }
}

export async function undoLog(client: LogClient, db: DB, userId: string, logId: string): Promise<boolean> {
  const ev = getLogEvent(db, userId, logId)
  if (!ev || ev.status === 'undone') return false
  const ids = JSON.parse(ev.consumedIdsJson ?? '[]') as string[]
  for (const id of ids) {
    await client.user.removeConsumedItem(id)
  }
  markUndone(db, userId, logId)
  return true
}
```
Run (PASS). Commit: `feat(server): log submit/undo service with alias learning`

---

### Task 5: Presets repository

**Files:** `modules/presets/presets.repo.ts` + `.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createPreset, listPresets, getPreset, deletePreset } from './presets.repo.js'

const items = [
  { rawText: '80g Haferflocken', productId: 'p1', amountG: 80, serving: null, servingQuantity: null },
  { rawText: '200ml Milch', productId: 'p2', amountG: 200, serving: null, servingQuantity: null },
]

describe('presets repo', () => {
  it('creates a preset with items, lists, loads, and deletes (cascade), user-scoped', async () => {
    const db = createTestDb()
    const u1 = await createUser(db, 'u1', 'pw-123456')
    const u2 = await createUser(db, 'u2', 'pw-123456')

    const p = createPreset(db, u1.id, 'Mein Müsli', items)
    expect(listPresets(db, u1.id)).toEqual([{ id: p.id, name: 'Mein Müsli' }])
    expect(listPresets(db, u2.id)).toEqual([])

    const loaded = getPreset(db, u1.id, p.id)!
    expect(loaded.name).toBe('Mein Müsli')
    expect(loaded.items).toHaveLength(2)
    expect(loaded.items[0]).toMatchObject({ productId: 'p1', amountG: 80, position: 0 })

    expect(getPreset(db, u2.id, p.id)).toBeUndefined()
    expect(deletePreset(db, u2.id, p.id)).toBe(false)
    expect(deletePreset(db, u1.id, p.id)).toBe(true)
    expect(getPreset(db, u1.id, p.id)).toBeUndefined()
  })

  it('rejects a duplicate preset name per user', async () => {
    const db = createTestDb()
    const u = await createUser(db, 'u', 'pw-123456')
    createPreset(db, u.id, 'Dup', items)
    expect(() => createPreset(db, u.id, 'Dup', items)).toThrow()
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/presets/presets.repo.test.ts`

- [ ] **Step 2: Implement** — `presets.repo.ts`
```ts
import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { presets, presetItems } from '../../db/schema.js'

export interface PresetItemInput {
  rawText: string
  productId: string
  serving?: string | null
  servingQuantity?: number | null
  amountG: number
}

export interface PresetSummary {
  id: string
  name: string
}

export interface PresetItem {
  position: number
  rawText: string
  productId: string
  serving: string | null
  servingQuantity: number | null
  amountG: number
}

export interface PresetWithItems extends PresetSummary {
  items: PresetItem[]
}

export function createPreset(
  db: DB,
  userId: string,
  name: string,
  items: PresetItemInput[],
): PresetSummary {
  const id = randomUUID()
  db.transaction((tx) => {
    tx.insert(presets).values({ id, userId, name, createdAt: Date.now() }).run()
    items.forEach((it, i) => {
      tx.insert(presetItems)
        .values({
          id: randomUUID(),
          presetId: id,
          position: i,
          rawText: it.rawText,
          productId: it.productId,
          serving: it.serving ?? null,
          servingQuantity: it.servingQuantity ?? null,
          amountG: it.amountG,
        })
        .run()
    })
  })
  return { id, name }
}

export function listPresets(db: DB, userId: string): PresetSummary[] {
  return db
    .select({ id: presets.id, name: presets.name })
    .from(presets)
    .where(eq(presets.userId, userId))
    .orderBy(asc(presets.name))
    .all()
}

export function getPreset(db: DB, userId: string, id: string): PresetWithItems | undefined {
  const preset = db
    .select({ id: presets.id, name: presets.name })
    .from(presets)
    .where(and(eq(presets.id, id), eq(presets.userId, userId)))
    .get()
  if (!preset) return undefined
  const items = db
    .select({
      position: presetItems.position,
      rawText: presetItems.rawText,
      productId: presetItems.productId,
      serving: presetItems.serving,
      servingQuantity: presetItems.servingQuantity,
      amountG: presetItems.amountG,
    })
    .from(presetItems)
    .where(eq(presetItems.presetId, id))
    .orderBy(asc(presetItems.position))
    .all()
  return { ...preset, items }
}

export function deletePreset(db: DB, userId: string, id: string): boolean {
  const preset = db
    .select({ id: presets.id })
    .from(presets)
    .where(and(eq(presets.id, id), eq(presets.userId, userId)))
    .get()
  if (!preset) return false
  db.transaction((tx) => {
    tx.delete(presetItems).where(eq(presetItems.presetId, id)).run()
    tx.delete(presets).where(eq(presets.id, id)).run()
  })
  return true
}
```
> `preset_items.preset_id` has ON DELETE cascade, but SQLite enforces it only with `foreign_keys=ON` (set in createDb). The explicit child-delete in the transaction makes deletion robust regardless and keeps it within the user-scoped flow.
Run (PASS). Commit: `feat(server): presets repository`

---

### Task 6: Presets routes + wire

**Files:** `http/routes/presets.routes.ts` + `.test.ts`; modify `app.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'

const BOOTSTRAP = 'test-bootstrap-token'
async function authed() {
  const app = buildApp(createTestDb())
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { token: BOOTSTRAP, username: 'jens', password: 'pw-123456' } })
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'jens', password: 'pw-123456' } })
  return { app, cookie: `${SESSION_COOKIE}=${login.cookies.find((c) => c.name === SESSION_COOKIE)!.value}` }
}
const body = { name: 'Mein Müsli', items: [{ rawText: '80g Haferflocken', productId: 'p1', amountG: 80 }] }

describe('presets routes', () => {
  it('401 without auth', async () => {
    const app = buildApp(createTestDb())
    expect((await app.inject({ method: 'GET', url: '/api/presets' })).statusCode).toBe(401)
  })

  it('creates, lists, loads and deletes a preset', async () => {
    const { app, cookie } = await authed()
    const create = await app.inject({ method: 'POST', url: '/api/presets', headers: { cookie }, payload: body })
    expect(create.statusCode).toBe(201)
    const id = create.json().id as string

    const list = await app.inject({ method: 'GET', url: '/api/presets', headers: { cookie } })
    expect(list.json()).toHaveLength(1)

    const load = await app.inject({ method: 'GET', url: `/api/presets/${id}`, headers: { cookie } })
    expect(load.json().items[0].productId).toBe('p1')

    expect((await app.inject({ method: 'DELETE', url: `/api/presets/${id}`, headers: { cookie } })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: `/api/presets/${id}`, headers: { cookie } })).statusCode).toBe(404)
  })
})
```
Run (FAIL): `npm run test -w server -- src/http/routes/presets.routes.test.ts`

- [ ] **Step 2: Implement** — `presets.routes.ts`
```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { createPreset, listPresets, getPreset, deletePreset } from '../../modules/presets/presets.repo.js'

const ItemSchema = z.object({
  rawText: z.string().min(1).max(200),
  productId: z.string().min(1),
  serving: z.string().nullish(),
  servingQuantity: z.number().nullish(),
  amountG: z.number().nonnegative(),
})

const CreateSchema = z.object({
  name: z.string().min(1).max(64),
  items: z.array(ItemSchema).min(1).max(50),
})

const IdParams = z.object({ id: z.string().min(1) })

export function registerPresetRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/presets', { preHandler: requireAuth }, async (req) => listPresets(db, req.user!.id))

  app.post('/api/presets', { preHandler: requireAuth }, async (req, reply) => {
    const b = CreateSchema.parse(req.body)
    const preset = createPreset(db, req.user!.id, b.name, b.items)
    return reply.status(201).send(preset)
  })

  app.get('/api/presets/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const preset = getPreset(db, req.user!.id, id)
    if (!preset) return reply.status(404).send({ error: 'not_found' })
    return preset
  })

  app.delete('/api/presets/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!deletePreset(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })
}
```
Wire into `app.ts`: import + `registerPresetRoutes(app, db)` after the match route.
> Catch the duplicate-name insert (SQLite UNIQUE throw): the global error handler turns an unhandled throw into 500. To return a clean 409, wrap the `createPreset` call in try/catch and map the constraint error → `reply.status(409).send({ error: 'name_taken' })`. (Add a test: creating two presets with the same name → second is 409.)
Run (PASS). Commit: `feat(server): preset routes + wiring`

---

### Task 7: Log routes (submit + undo) + wire

**Files:** `http/routes/log.routes.ts` + `.test.ts`; modify `app.ts`.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const add = vi.fn().mockResolvedValue(undefined)
const remove = vi.fn().mockResolvedValue(undefined)
vi.mock('../../modules/yazio/client.js', () => ({
  buildYazioClient: () => ({ user: { addConsumedItem: add, removeConsumedItem: remove } }),
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
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
  return { db, app, cookie, userId: me.json().id as string }
}

beforeEach(() => { add.mockClear(); remove.mockClear() })

describe('POST /api/log', () => {
  it('409 when no account', async () => {
    const { app, cookie } = await authed()
    const res = await app.inject({ method: 'POST', url: '/api/log', headers: { cookie }, payload: { daytime: 'breakfast', date: '2026-06-08', lines: [{ productId: 'p1', name: 'X', amountGrams: 80 }] } })
    expect(res.statusCode).toBe(409)
  })

  it('logs lines and supports undo', async () => {
    const { db, app, cookie, userId } = await authed()
    createAccount(db, userId, 'Me', { username: 'me@x.de', password: 'secret' })

    const log = await app.inject({ method: 'POST', url: '/api/log', headers: { cookie }, payload: { date: '2026-06-08', daytime: 'breakfast', lines: [{ productId: 'p1', name: 'Haferflocken', amountGrams: 80 }] } })
    expect(log.statusCode).toBe(201)
    expect(add).toHaveBeenCalledTimes(1)
    const logId = log.json().logId as string

    const undo = await app.inject({ method: 'POST', url: `/api/log/${logId}/undo`, headers: { cookie } })
    expect(undo.statusCode).toBe(204)
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('auto-resolves daytime when omitted', async () => {
    const { db, app, cookie, userId } = await authed()
    createAccount(db, userId, 'Me', { username: 'me@x.de', password: 'secret' })
    const log = await app.inject({ method: 'POST', url: '/api/log', headers: { cookie }, payload: { lines: [{ productId: 'p1', name: 'X', amountGrams: 80 }] } })
    expect(log.statusCode).toBe(201)
    expect(['breakfast', 'lunch', 'dinner', 'snack']).toContain(log.json().daytime)
  })
})
```
Run (FAIL): `npm run test -w server -- src/http/routes/log.routes.test.ts`

- [ ] **Step 2: Implement** — `log.routes.ts`
```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { getAccount, getDefaultAccount } from '../../modules/accounts/accounts.repo.js'
import { buildYazioClient } from '../../modules/yazio/client.js'
import { submitLog, undoLog, type LogClient } from '../../modules/logging/log.service.js'
import { getLogEvent } from '../../modules/logging/log-events.repo.js'
import { resolveDaytime, dateInTz, DAYTIMES } from '../../modules/meals/daytime.js'

const LineSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1).max(200),
  amountGrams: z.number().nonnegative(),
  serving: z.string().nullish(),
  servingQuantity: z.number().nullish(),
})

const LogSchema = z.object({
  accountId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  daytime: z.enum(DAYTIMES as [string, ...string[]]).optional(),
  lines: z.array(LineSchema).min(1).max(50),
})

const IdParams = z.object({ id: z.string().min(1) })

export function registerLogRoutes(app: FastifyInstance, db: DB): void {
  app.post('/api/log', { preHandler: requireAuth }, async (req, reply) => {
    const b = LogSchema.parse(req.body)
    const userId = req.user!.id
    const account = b.accountId ? getAccount(db, userId, b.accountId) : getDefaultAccount(db, userId)
    if (!account) return reply.status(409).send({ error: 'no_account' })

    const now = new Date()
    const date = b.date ?? dateInTz(now, env.TZ)
    const daytime = (b.daytime as ReturnType<typeof resolveDaytime>) ?? resolveDaytime(now, env.TZ)

    const client = buildYazioClient(db, account) as unknown as LogClient
    const result = await submitLog(client, db, userId, account.id, {
      date,
      daytime,
      lines: b.lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        amountGrams: l.amountGrams,
        serving: l.serving ?? null,
        servingQuantity: l.servingQuantity ?? null,
      })),
    })
    return reply.status(201).send({ logId: result.logId, count: result.count, date, daytime, accountId: account.id })
  })

  app.post('/api/log/:id/undo', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    const userId = req.user!.id
    const ev = getLogEvent(db, userId, id)
    if (!ev) return reply.status(404).send({ error: 'not_found' })
    const account = getAccount(db, userId, ev.yazioAccountId)
    if (!account) return reply.status(409).send({ error: 'no_account' })
    const client = buildYazioClient(db, account) as unknown as LogClient
    const ok = await undoLog(client, db, userId, id)
    if (!ok) return reply.status(409).send({ error: 'already_undone' })
    return reply.status(204).send()
  })
}
```
Wire into `app.ts`: import + `registerLogRoutes(app, db)` after presets.
Run (PASS) + full suite. Commit: `feat(server): log + undo routes + wiring`

---

## Self-Review (M4 scope)
- daytime auto-resolve (TZ windows) + override; date in TZ → Tasks 1,7. ✅
- consumed-item builder (client-gen uuid; gram + serving) → Task 2. ✅
- submit logs each line, learns aliases, records event; undo removes items + marks undone → Tasks 3,4,7. ✅
- presets CRUD (create-with-items, list, load, delete; user-scoped; dup→409) → Tasks 5,6. ✅
- All routes auth-gated; account/user scoped; no secret leakage. ✅

**Forward (M5):** the frontend calls `/api/match` then lets the user correct → `/api/log` (with corrected lines) → shows undo; manages presets via `/api/presets`; account management via `/api/accounts`. All backend endpoints for the SPA now exist.
