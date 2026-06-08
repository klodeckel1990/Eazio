# Eazio M2 — Yazio Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Authenticated users can link one or more Yazio accounts (credentials verified against Yazio, then stored AES-encrypted), list them, switch the default, and remove them — with a Yazio client wrapper that caches per-account tokens (token resolver + onRefresh) so repeated calls avoid re-login.

**Architecture:** New modules `modules/accounts` (repo + service) and `modules/yazio` (client wrapper), plus `http/routes/accounts.routes.ts` wired into the existing `buildApp`. Reuses M1: `env`, `crypto/aes` (encrypt/decrypt), `db` (yazioAccounts table already migrated), `http/auth-guard` (requireAuth), session auth.

**Tech Stack:** `yazio` (npm), Fastify 5, drizzle 0.45 (better-sqlite3, sync incl. `db.transaction`), zod v4, Vitest with `vi.mock('yazio')`.

**Reference:** spec `docs/superpowers/specs/2026-06-08-eazio-yazio-meal-tracker-design.md`; roadmap `docs/superpowers/plans/2026-06-08-eazio-roadmap.md` (verified Yazio API contract is in the roadmap).

## Verified Yazio facts used here
- `new Yazio(init)` where `init = { credentials?: {username,password}; token?: Token | (()=>Token|Promise<Token|null>|null); onRefresh?: (a:{token:Token})=>any }`. At least credentials OR token. Both is valid (token used while valid, credentials re-auth on expiry).
- `Token = { token_type, access_token, refresh_token, expires_in, expires_at }` (`expires_at` epoch ms). No refresh grant; `onRefresh({token})` fires only on a fresh login and is NOT awaited.
- `yazio.user.get()` returns the user profile — used to verify credentials. Throws on bad auth.

## Reused M1 interfaces
- `server/src/crypto/aes.ts`: `encrypt(s: string): string`, `decrypt(s: string): string`.
- `server/src/db/client.ts`: `type DB`. `server/src/db/test-db.ts`: `createTestDb()`.
- `server/src/db/schema.ts`: `yazioAccounts` cols `{ id, userId, label, yazioUsername, encCredentials, encTokens(nullable), isDefault(boolean), updatedAt }`.
- `server/src/http/auth-guard.ts`: `requireAuth(req, reply)`.
- `server/src/app.ts`: `buildApp(db)` (registers routes; `req.user: {id}|null`).
- Test auth helper pattern: bootstrap (`token: 'test-bootstrap-token'`) then login → read `SESSION_COOKIE` cookie → send as `cookie` header.

## File structure (new)
```
server/src/modules/accounts/
  accounts.repo.ts        accounts.repo.test.ts
  accounts.service.ts     accounts.service.test.ts
server/src/modules/yazio/
  client.ts               client.test.ts
server/src/http/routes/
  accounts.routes.ts      accounts.routes.test.ts
```

Conventions: ESM `.js` import suffixes; drizzle sync `.run()/.get()/.all()`; verify with `npm run typecheck -w server` + `npm run test -w server` (both green at each task end).

---

### Task 1: Install `yazio` + a minimal Token type guard

**Files:** modify `server/package.json` (dep); create `server/src/modules/yazio/types.ts`.

- [ ] **Step 1: Install**

Run (repo root): `npm install -w server yazio`
Then inspect what the package exports: `node -e "import('yazio').then(m=>console.log(Object.keys(m)))"`. Confirm `Yazio` is exported. Note whether a `Token` type is exported from `'yazio'` (TS types).

- [ ] **Step 2: Token type** — `server/src/modules/yazio/types.ts`

```ts
// Mirrors the yazio library Token shape (src/types/auth.ts). Use the library's
// exported type instead if available; this local copy keeps us decoupled and
// is what we persist (encrypted) in yazio_accounts.encTokens.
export interface YazioToken {
  token_type: string
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number // epoch ms
}
```

- [ ] **Step 3: Commit**
```bash
git add server/package.json package-lock.json server/src/modules/yazio/types.ts
git commit -m "feat(server): add yazio dependency + token type"
```

---

### Task 2: Accounts repository

**Files:** create `server/src/modules/accounts/accounts.repo.ts` + `accounts.repo.test.ts`.

- [ ] **Step 1: Write the failing test** — `accounts.repo.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import {
  createAccount, listAccounts, getAccount, getDefaultAccount,
  setDefaultAccount, removeAccount, getCredentials, updateTokens,
} from './accounts.repo.js'

async function seedUser(db: ReturnType<typeof createTestDb>) {
  return createUser(db, 'jens', 'pw-123456')
}

describe('accounts repo', () => {
  it('creates the first account as default and never returns secrets in summaries', async () => {
    const db = createTestDb()
    const user = await seedUser(db)
    const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret-pw' })
    expect(acc.isDefault).toBe(true)
    expect(acc).not.toHaveProperty('encCredentials')

    const list = listAccounts(db, user.id)
    expect(list).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain('secret-pw')

    const rec = getAccount(db, user.id, acc.id)
    expect(getCredentials(rec!)).toEqual({ username: 'me@x.de', password: 'secret-pw' })
  })

  it('keeps exactly one default and promotes on delete', async () => {
    const db = createTestDb()
    const user = await seedUser(db)
    const a = createAccount(db, user.id, 'A', { username: 'a', password: 'pa' })
    const b = createAccount(db, user.id, 'B', { username: 'b', password: 'pb' })
    expect(a.isDefault).toBe(true)
    expect(b.isDefault).toBe(false)

    expect(setDefaultAccount(db, user.id, b.id)).toBe(true)
    expect(getDefaultAccount(db, user.id)?.id).toBe(b.id)
    expect(listAccounts(db, user.id).filter((x) => x.isDefault)).toHaveLength(1)

    expect(removeAccount(db, user.id, b.id)).toBe(true)
    // a is promoted back to default
    expect(getDefaultAccount(db, user.id)?.id).toBe(a.id)
  })

  it('scopes access by user and round-trips tokens', async () => {
    const db = createTestDb()
    const u1 = await createUser(db, 'u1', 'pw-123456')
    const u2 = await createUser(db, 'u2', 'pw-123456')
    const a = createAccount(db, u1.id, 'A', { username: 'a', password: 'pa' })
    expect(getAccount(db, u2.id, a.id)).toBeUndefined()
    expect(setDefaultAccount(db, u2.id, a.id)).toBe(false)
    expect(removeAccount(db, u2.id, a.id)).toBe(false)

    updateTokens(db, a.id, 'enc-token-blob')
    expect(getAccount(db, u1.id, a.id)?.encTokens).toBe('enc-token-blob')
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/accounts/accounts.repo.test.ts`

- [ ] **Step 2: Implement** — `accounts.repo.ts`

```ts
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { yazioAccounts } from '../../db/schema.js'
import { encrypt, decrypt } from '../../crypto/aes.js'

export interface StoredCredentials {
  username: string
  password: string
}

export interface AccountSummary {
  id: string
  label: string
  yazioUsername: string
  isDefault: boolean
}

export type AccountRecord = typeof yazioAccounts.$inferSelect

export function createAccount(
  db: DB,
  userId: string,
  label: string,
  creds: StoredCredentials,
): AccountSummary {
  const id = randomUUID()
  const existing = db
    .select({ id: yazioAccounts.id })
    .from(yazioAccounts)
    .where(eq(yazioAccounts.userId, userId))
    .all()
  const isDefault = existing.length === 0
  db.insert(yazioAccounts)
    .values({
      id,
      userId,
      label,
      yazioUsername: creds.username,
      encCredentials: encrypt(JSON.stringify(creds)),
      encTokens: null,
      isDefault,
      updatedAt: Date.now(),
    })
    .run()
  return { id, label, yazioUsername: creds.username, isDefault }
}

export function listAccounts(db: DB, userId: string): AccountSummary[] {
  return db
    .select({
      id: yazioAccounts.id,
      label: yazioAccounts.label,
      yazioUsername: yazioAccounts.yazioUsername,
      isDefault: yazioAccounts.isDefault,
    })
    .from(yazioAccounts)
    .where(eq(yazioAccounts.userId, userId))
    .all()
}

export function getAccount(db: DB, userId: string, id: string): AccountRecord | undefined {
  return db
    .select()
    .from(yazioAccounts)
    .where(and(eq(yazioAccounts.id, id), eq(yazioAccounts.userId, userId)))
    .get()
}

export function getDefaultAccount(db: DB, userId: string): AccountRecord | undefined {
  return db
    .select()
    .from(yazioAccounts)
    .where(and(eq(yazioAccounts.userId, userId), eq(yazioAccounts.isDefault, true)))
    .get()
}

export function setDefaultAccount(db: DB, userId: string, id: string): boolean {
  if (!getAccount(db, userId, id)) return false
  db.transaction((tx) => {
    tx.update(yazioAccounts).set({ isDefault: false }).where(eq(yazioAccounts.userId, userId)).run()
    tx
      .update(yazioAccounts)
      .set({ isDefault: true, updatedAt: Date.now() })
      .where(eq(yazioAccounts.id, id))
      .run()
  })
  return true
}

export function removeAccount(db: DB, userId: string, id: string): boolean {
  const acc = getAccount(db, userId, id)
  if (!acc) return false
  db.delete(yazioAccounts).where(eq(yazioAccounts.id, id)).run()
  if (acc.isDefault) {
    const next = db
      .select({ id: yazioAccounts.id })
      .from(yazioAccounts)
      .where(eq(yazioAccounts.userId, userId))
      .get()
    if (next) {
      db.update(yazioAccounts).set({ isDefault: true }).where(eq(yazioAccounts.id, next.id)).run()
    }
  }
  return true
}

export function getCredentials(account: AccountRecord): StoredCredentials {
  return JSON.parse(decrypt(account.encCredentials)) as StoredCredentials
}

export function updateTokens(db: DB, accountId: string, encTokens: string): void {
  db.update(yazioAccounts)
    .set({ encTokens, updatedAt: Date.now() })
    .where(eq(yazioAccounts.id, accountId))
    .run()
}
```
Run (PASS). Commit: `feat(server): yazio accounts repository`

---

### Task 3: Yazio client wrapper (token caching) + credential verification

**Files:** create `server/src/modules/yazio/client.ts` + `client.test.ts`.

- [ ] **Step 1: Write the failing test** — `client.test.ts` (mocks the `yazio` package)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the init object the Yazio constructor receives, and let tests drive user.get().
const userGet = vi.fn()
let lastInit: any = null
vi.mock('yazio', () => ({
  Yazio: vi.fn().mockImplementation((init: any) => {
    lastInit = init
    return { user: { get: userGet } }
  }),
}))

import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount, getAccount, getCredentials } from '../accounts/accounts.repo.js'
import { decrypt } from '../../crypto/aes.js'
import { buildYazioClient, verifyConnection, verifyCredentials } from './client.js'
import type { YazioToken } from './types.js'

const TOKEN: YazioToken = {
  token_type: 'bearer', access_token: 'a', refresh_token: 'r',
  expires_in: 3600, expires_at: 9_999_999_999_999,
}

beforeEach(() => {
  userGet.mockReset()
  lastInit = null
})

describe('yazio client wrapper', () => {
  it('passes decrypted credentials and a token resolver that reads enc_tokens', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret' })
    const rec = getAccount(db, user.id, acc.id)!

    buildYazioClient(db, rec)
    expect(lastInit.credentials).toEqual({ username: 'me@x.de', password: 'secret' })
    // no tokens yet → resolver returns null
    expect(lastInit.token()).toBeNull()
  })

  it('persists refreshed tokens encrypted and serves them back via the resolver', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret' })
    const rec = getAccount(db, user.id, acc.id)!

    buildYazioClient(db, rec)
    lastInit.onRefresh({ token: TOKEN }) // simulate a fresh login

    const stored = getAccount(db, user.id, acc.id)!.encTokens!
    expect(stored).not.toContain('access_token') // it's encrypted
    expect(JSON.parse(decrypt(stored))).toEqual(TOKEN)
    // resolver now returns the cached token
    expect(lastInit.token()).toEqual(TOKEN)
  })

  it('verifyConnection / verifyCredentials reflect user.get() success/failure', async () => {
    userGet.mockResolvedValueOnce({ id: 'x' })
    expect(await verifyCredentials({ username: 'a', password: 'b' })).toBe(true)
    userGet.mockRejectedValueOnce(new Error('401'))
    expect(await verifyCredentials({ username: 'a', password: 'b' })).toBe(false)
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/yazio/client.test.ts`

- [ ] **Step 2: Implement** — `client.ts`

```ts
import { Yazio } from 'yazio'
import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { yazioAccounts } from '../../db/schema.js'
import { encrypt, decrypt } from '../../crypto/aes.js'
import { getCredentials, type AccountRecord, type StoredCredentials } from '../accounts/accounts.repo.js'
import type { YazioToken } from './types.js'

/** Builds a Yazio client for a stored account with persistent token caching. */
export function buildYazioClient(db: DB, account: AccountRecord): Yazio {
  const creds = getCredentials(account)
  return new Yazio({
    credentials: creds,
    // Read the freshest cached token from the DB each call; null → library logs in.
    token: () => {
      const row = db
        .select({ encTokens: yazioAccounts.encTokens })
        .from(yazioAccounts)
        .where(eq(yazioAccounts.id, account.id))
        .get()
      if (!row?.encTokens) return null
      return JSON.parse(decrypt(row.encTokens)) as YazioToken
    },
    // Persist freshly issued tokens (encrypted). Fire-and-forget by the library.
    onRefresh: ({ token }: { token: YazioToken }) => {
      db.update(yazioAccounts)
        .set({ encTokens: encrypt(JSON.stringify(token)), updatedAt: Date.now() })
        .where(eq(yazioAccounts.id, account.id))
        .run()
    },
  })
}

/** Confirms a client can authenticate by fetching the user profile. */
export async function verifyConnection(client: Yazio): Promise<boolean> {
  try {
    await client.user.get()
    return true
  } catch {
    return false
  }
}

/** One-shot credential check (no token persistence) used when linking an account. */
export function verifyCredentials(creds: StoredCredentials): Promise<boolean> {
  return verifyConnection(new Yazio({ credentials: creds }))
}
```
> If TypeScript complains that the `token`/`onRefresh` shapes don't match the library's exported types, import the library's `Token`/`YazioAuthInit` types and align; do NOT use `any`. If the library exports `Token`, prefer it over the local `YazioToken`.

Run (PASS). Commit: `feat(server): yazio client wrapper with token caching`

---

### Task 4: Accounts service (link/list/setDefault/remove)

**Files:** create `server/src/modules/accounts/accounts.service.ts` + `accounts.service.test.ts`.

- [ ] **Step 1: Write the failing test** — `accounts.service.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyCredentials = vi.fn()
vi.mock('../yazio/client.js', () => ({ verifyCredentials: (c: unknown) => verifyCredentials(c) }))

import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { linkAccount } from './accounts.service.js'
import { listAccounts } from './accounts.repo.js'

beforeEach(() => verifyCredentials.mockReset())

describe('accounts service', () => {
  it('rejects linking when Yazio auth fails and stores nothing', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    verifyCredentials.mockResolvedValueOnce(false)
    const res = await linkAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'bad' })
    expect(res.ok).toBe(false)
    expect(listAccounts(db, user.id)).toHaveLength(0)
  })

  it('verifies then stores the account on success', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')
    verifyCredentials.mockResolvedValueOnce(true)
    const res = await linkAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'good' })
    expect(res.ok).toBe(true)
    expect(listAccounts(db, user.id)).toHaveLength(1)
    expect(verifyCredentials).toHaveBeenCalledOnce()
  })
})
```
Run (FAIL): `npm run test -w server -- src/modules/accounts/accounts.service.test.ts`

- [ ] **Step 2: Implement** — `accounts.service.ts`

```ts
import type { DB } from '../../db/client.js'
import { createAccount, type AccountSummary, type StoredCredentials } from './accounts.repo.js'
import { verifyCredentials } from '../yazio/client.js'

export type LinkResult =
  | { ok: true; account: AccountSummary }
  | { ok: false; reason: 'auth_failed' }

/** Verifies the Yazio credentials before persisting the (encrypted) account. */
export async function linkAccount(
  db: DB,
  userId: string,
  label: string,
  creds: StoredCredentials,
): Promise<LinkResult> {
  if (!(await verifyCredentials(creds))) {
    return { ok: false, reason: 'auth_failed' }
  }
  return { ok: true, account: createAccount(db, userId, label, creds) }
}
```
Run (PASS). Commit: `feat(server): accounts service (verify-then-store)`

---

### Task 5: Account HTTP routes + wire into app

**Files:** create `server/src/http/routes/accounts.routes.ts` + `accounts.routes.test.ts`; modify `server/src/app.ts`.

- [ ] **Step 1: Write the failing test** — `accounts.routes.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const verifyCredentials = vi.fn()
vi.mock('../../modules/yazio/client.js', () => ({
  verifyCredentials: (c: unknown) => verifyCredentials(c),
}))

import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'

const BOOTSTRAP = 'test-bootstrap-token'

async function authedApp() {
  const app = buildApp(createTestDb())
  await app.inject({
    method: 'POST', url: '/api/auth/bootstrap',
    payload: { token: BOOTSTRAP, username: 'jens', password: 'pw-123456' },
  })
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { username: 'jens', password: 'pw-123456' },
  })
  const c = login.cookies.find((x) => x.name === SESSION_COOKIE)!
  return { app, cookie: `${SESSION_COOKIE}=${c.value}` }
}

beforeEach(() => verifyCredentials.mockReset())

describe('account routes', () => {
  it('requires authentication', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/api/accounts' })
    expect(res.statusCode).toBe(401)
  })

  it('links, lists, sets default and removes an account', async () => {
    const { app, cookie } = await authedApp()
    verifyCredentials.mockResolvedValue(true)

    const link = await app.inject({
      method: 'POST', url: '/api/accounts', headers: { cookie },
      payload: { label: 'Me', username: 'me@x.de', password: 'good' },
    })
    expect(link.statusCode).toBe(201)
    const id = link.json().id as string
    expect(JSON.stringify(link.json())).not.toContain('good')

    const list = await app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie } })
    expect(list.statusCode).toBe(200)
    expect(list.json()).toHaveLength(1)

    const def = await app.inject({ method: 'PATCH', url: `/api/accounts/${id}/default`, headers: { cookie } })
    expect(def.statusCode).toBe(204)

    const del = await app.inject({ method: 'DELETE', url: `/api/accounts/${id}`, headers: { cookie } })
    expect(del.statusCode).toBe(204)
  })

  it('returns 400 when Yazio rejects the credentials', async () => {
    const { app, cookie } = await authedApp()
    verifyCredentials.mockResolvedValue(false)
    const res = await app.inject({
      method: 'POST', url: '/api/accounts', headers: { cookie },
      payload: { label: 'Bad', username: 'x', password: 'y' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('404 on default/delete of an unknown account', async () => {
    const { app, cookie } = await authedApp()
    const r1 = await app.inject({ method: 'PATCH', url: '/api/accounts/nope/default', headers: { cookie } })
    expect(r1.statusCode).toBe(404)
    const r2 = await app.inject({ method: 'DELETE', url: '/api/accounts/nope', headers: { cookie } })
    expect(r2.statusCode).toBe(404)
  })
})
```
Run (FAIL): `npm run test -w server -- src/http/routes/accounts.routes.test.ts`

- [ ] **Step 2: Implement** — `accounts.routes.ts`

```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { DB } from '../../db/client.js'
import { requireAuth } from '../auth-guard.js'
import { linkAccount } from '../../modules/accounts/accounts.service.js'
import { listAccounts, setDefaultAccount, removeAccount } from '../../modules/accounts/accounts.repo.js'

const LinkSchema = z.object({
  label: z.string().min(1).max(64),
  username: z.string().min(1),
  password: z.string().min(1),
})

const IdParams = z.object({ id: z.string().min(1) })

export function registerAccountRoutes(app: FastifyInstance, db: DB): void {
  app.get('/api/accounts', { preHandler: requireAuth }, async (req) => {
    return listAccounts(db, req.user!.id)
  })

  app.post('/api/accounts', { preHandler: requireAuth }, async (req, reply) => {
    const body = LinkSchema.parse(req.body)
    const result = await linkAccount(db, req.user!.id, body.label, {
      username: body.username,
      password: body.password,
    })
    if (!result.ok) return reply.status(400).send({ error: 'yazio_auth_failed' })
    return reply.status(201).send(result.account)
  })

  app.patch('/api/accounts/:id/default', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!setDefaultAccount(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })

  app.delete('/api/accounts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = IdParams.parse(req.params)
    if (!removeAccount(db, req.user!.id, id)) return reply.status(404).send({ error: 'not_found' })
    return reply.status(204).send()
  })
}
```

- [ ] **Step 3: Wire into `server/src/app.ts`** — add the import and registration

Add import near the other route imports:
```ts
import { registerAccountRoutes } from './http/routes/accounts.routes.js'
```
Add after `registerAuthRoutes(app, db)`:
```ts
  registerAccountRoutes(app, db)
```

Run (PASS): `npm run test -w server -- src/http/routes/accounts.routes.test.ts` and the full suite. Commit: `feat(server): account REST routes + wiring`

---

### Task 6: Carry-forward M1 fixes (migrate-cli dir + graceful sqlite close)

**Files:** modify `server/src/db/migrate-cli.ts`, `server/src/db/client.ts` (export a dir helper), `server/src/index.ts`.

- [ ] **Step 1: Add a shared `ensureDbDir` to `client.ts`** (so both index and migrate-cli use it)

Add to `server/src/db/client.ts`:
```ts
import { mkdirSync } from 'node:fs'

/** Creates the parent directory for a file-based SQLite path (no-op for :memory:). */
export function ensureDbDir(dbPath: string): void {
  if (dbPath === ':memory:') return
  mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true })
}
```
(`path` is already imported in client.ts.)

- [ ] **Step 2: Use it in `migrate-cli.ts`**
```ts
import { createDb, runMigrations, ensureDbDir } from './client.js'
import { env } from '../config/env.js'

ensureDbDir(env.DATABASE_PATH)
const { db, sqlite } = createDb(env.DATABASE_PATH)
runMigrations(db)
sqlite.close()
console.log(`Migrations applied to ${env.DATABASE_PATH}`)
```

- [ ] **Step 3: Use the shared helper + close sqlite on shutdown in `index.ts`**

Replace the local `ensureDbDir` definition with an import from `./db/client.js`, and close the connection on shutdown:
```ts
import { env } from './config/env.js'
import { createDb, runMigrations, ensureDbDir } from './db/client.js'
import { buildApp } from './app.js'

async function main(): Promise<void> {
  ensureDbDir(env.DATABASE_PATH)
  const { db, sqlite } = createDb(env.DATABASE_PATH)
  runMigrations(db)

  const app = buildApp(db)

  const shutdown = async (): Promise<void> => {
    await app.close()
    sqlite.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```
(Remove the now-unused `mkdirSync`/`path` imports from index.ts.)

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck -w server` and `npm run test -w server` (all green). Then:
```bash
git add server/src/db/client.ts server/src/db/migrate-cli.ts server/src/index.ts
git commit -m "fix(server): share ensureDbDir + close sqlite on shutdown/migrate"
```

---

## Self-Review (against M2 scope)
- Link/list/setDefault/remove implemented + behind `requireAuth` → Tasks 2,5. ✅
- Credentials verified against Yazio before storage; stored AES-encrypted; never returned/logged → Tasks 3,4,5. ✅
- Per-account token caching via `token` resolver + `onRefresh` (encrypted persistence) → Task 3. ✅
- One-default-per-user enforced at app layer (create=first is default; setDefault transaction; promote-on-delete) → Task 2. ✅
- Multi-user isolation (all repo ops scoped by userId) → Task 2. ✅
- Carry-forward M1 deploy landmines fixed → Task 6. ✅

**Type consistency:** `AccountRecord`/`AccountSummary`/`StoredCredentials` defined once in accounts.repo and imported elsewhere; `YazioToken` in yazio/types; `verifyCredentials` mocked identically across service+route tests.

**Forward (M3+):** `getDefaultAccount`/`getAccount` + `buildYazioClient` are the entry points M3/M4 use to run product search and consumed-item logging against the active account.
