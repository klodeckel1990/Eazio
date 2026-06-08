# Eazio M1 — Foundation & Auth · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lauffähiges Monorepo-Gerüst mit ENV-Config, vollständigem Drizzle-SQLite-Schema + Migrations, AES-256-GCM-Krypto und App-Authentifizierung (argon2, serverseitige Sessions, Bootstrap-Token) — sodass man Nutzer anlegen, einloggen und Sessions prüfen kann.

**Architecture:** Fastify-5-API (ESM, TypeScript NodeNext), `better-sqlite3` + Drizzle ORM, Auth über serverseitige Sessions mit signiertem Cookie. Domänen liegen unter `server/src/modules/*`, HTTP unter `server/src/http/*`. Das **vollständige** DB-Schema (auch für M2–M4) wird hier definiert, damit spätere Milestones nur darauf zugreifen.

**Tech Stack:** Node 22, TypeScript, Fastify 5, @fastify/cookie, @fastify/rate-limit, better-sqlite3, drizzle-orm, drizzle-kit, argon2, zod, dotenv, Vitest, tsx.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-08-eazio-yazio-meal-tracker-design.md`
**Roadmap:** `docs/superpowers/plans/2026-06-08-eazio-roadmap.md`

---

## Dateistruktur (nach M1)

```
/ (Root)
├─ package.json                 (npm workspaces: server, web)
├─ tsconfig.base.json
├─ .gitignore
├─ .nvmrc
├─ .env.example
├─ server/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ vitest.config.ts
│  ├─ drizzle.config.ts
│  ├─ drizzle/                  (generierte Migrationen)
│  ├─ test/
│  │  └─ setup.ts               (Test-ENV)
│  └─ src/
│     ├─ index.ts               (Server-Bootstrap)
│     ├─ app.ts                 (buildApp-Factory)
│     ├─ config/
│     │  └─ env.ts              (zod-validierte ENV)
│     ├─ crypto/
│     │  └─ aes.ts              (AES-256-GCM)
│     ├─ db/
│     │  ├─ schema.ts           (ALLE Tabellen)
│     │  ├─ client.ts           (createDb, runMigrations, MIGRATIONS_DIR)
│     │  ├─ test-db.ts          (createTestDb Helper)
│     │  └─ migrate-cli.ts      (Deploy-Migration)
│     ├─ http/
│     │  ├─ errors.ts           (ZodError → 400 Handler)
│     │  ├─ auth-guard.ts       (requireAuth preHandler)
│     │  └─ routes/
│     │     ├─ health.routes.ts
│     │     └─ auth.routes.ts
│     └─ modules/
│        └─ auth/
│           ├─ password.ts      (argon2)
│           ├─ users.repo.ts    (createUser, findUserByUsername, findUserById)
│           └─ sessions.ts      (createSession, getSession, deleteSession)
```

**Konventionen für alle Tasks:**
- ESM + NodeNext ⇒ relative Imports IMMER mit `.js`-Endung (z.B. `import { env } from '../config/env.js'`).
- `better-sqlite3` ist synchron: Drizzle-Queries mit `.run()` / `.get()` / `.all()`.
- Tests: `npm run test --workspace server` (bzw. `cd server && npx vitest run <pfad>`).

---

### Task 1: Monorepo-Scaffold (Root)

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.env.example`

- [ ] **Step 1: Root `package.json`**

```json
{
  "name": "eazio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["server"],
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "npm run dev --workspace server",
    "build": "npm run build --workspace server",
    "test": "npm run test --workspace server",
    "lint": "npm run typecheck --workspace server"
  }
}
```

> `web` wird in M5 zur `workspaces`-Liste hinzugefügt.

- [ ] **Step 2: `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 3: `.gitignore`**

```gitignore
node_modules/
dist/
data/
*.local
.env
.env.*
!.env.example
coverage/
*.log
```

- [ ] **Step 4: `.nvmrc`**

```
22
```

- [ ] **Step 5: `.env.example`**

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_PATH=./data/eazio.db
# 32-Byte-Key, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
MASTER_KEY=
# zufälliger String, min. 16 Zeichen
SESSION_SECRET=
# Token zum Anlegen von Nutzern (POST /api/auth/bootstrap)
ADMIN_BOOTSTRAP=
TZ=Europe/Berlin
COOKIE_SECURE=true
YAZIO_COUNTRIES=DE
YAZIO_LOCALES=de_DE,de_US
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json .gitignore .nvmrc .env.example
git commit -m "chore: scaffold eazio monorepo root"
```

---

### Task 2: Server-Package + Health-Route (erster grüner Test)

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/test/setup.ts`
- Create: `server/src/http/routes/health.routes.ts`
- Test: `server/src/http/routes/health.routes.test.ts`

- [ ] **Step 1: `server/package.json` + Dependencies installieren**

```json
{
  "name": "@eazio/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate-cli.ts"
  }
}
```

Dann installieren (vom Repo-Root):

```bash
npm install -w server fastify @fastify/cookie @fastify/rate-limit @fastify/static better-sqlite3 drizzle-orm argon2 zod dotenv
npm install -w server -D typescript tsx vitest drizzle-kit @types/node @types/better-sqlite3
```

- [ ] **Step 2: `server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: `server/test/setup.ts`** (Test-ENV, läuft vor allen Test-Modulen)

```ts
// Stellt ENV bereit, bevor src/config/env.ts beim Import geparst wird.
process.env.NODE_ENV = 'test'
process.env.PORT = '0'
process.env.DATABASE_PATH = ':memory:'
process.env.MASTER_KEY = Buffer.alloc(32, 7).toString('base64')
process.env.SESSION_SECRET = 'test-session-secret-0123456789'
process.env.ADMIN_BOOTSTRAP = 'test-bootstrap-token'
process.env.TZ = 'Europe/Berlin'
process.env.COOKIE_SECURE = 'false'
```

- [ ] **Step 5: Write the failing test** — `server/src/http/routes/health.routes.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { registerHealthRoutes } from './health.routes.js'

describe('health route', () => {
  it('returns ok status', async () => {
    const app = Fastify()
    registerHealthRoutes(app)
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd server && npx vitest run src/http/routes/health.routes.test.ts`
Expected: FAIL — `Cannot find module './health.routes.js'`.

- [ ] **Step 7: Implement** — `server/src/http/routes/health.routes.ts`

```ts
import type { FastifyInstance } from 'fastify'

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ status: 'ok' as const }))
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd server && npx vitest run src/http/routes/health.routes.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/package.json server/tsconfig.json server/vitest.config.ts server/test/setup.ts server/src/http/routes/health.routes.ts server/src/http/routes/health.routes.test.ts package-lock.json
git commit -m "feat(server): scaffold fastify package with health route"
```

---

### Task 3: ENV-Config-Modul

**Files:**
- Create: `server/src/config/env.ts`
- Test: `server/src/config/env.test.ts`

- [ ] **Step 1: Write the failing test** — `server/src/config/env.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { env } from './env.js'

describe('env config', () => {
  it('parses test environment with sane values', () => {
    expect(env.NODE_ENV).toBe('test')
    expect(env.DATABASE_PATH).toBe(':memory:')
    expect(Buffer.from(env.MASTER_KEY, 'base64').length).toBe(32)
    expect(env.YAZIO_COUNTRIES).toBe('DE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/config/env.test.ts`
Expected: FAIL — `Cannot find module './env.js'`.

- [ ] **Step 3: Implement** — `server/src/config/env.ts`

```ts
import 'dotenv/config'
import { z } from 'zod'

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_PATH: z.string().default('./data/eazio.db'),
  MASTER_KEY: z
    .string()
    .refine((v) => {
      try {
        return Buffer.from(v, 'base64').length === 32
      } catch {
        return false
      }
    }, 'MASTER_KEY must be 32 bytes encoded as base64'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars'),
  ADMIN_BOOTSTRAP: z.string().min(8, 'ADMIN_BOOTSTRAP must be at least 8 chars'),
  TZ: z.string().default('Europe/Berlin'),
  COOKIE_SECURE: boolish.default(true),
  YAZIO_COUNTRIES: z.string().default('DE'),
  YAZIO_LOCALES: z.string().default('de_DE,de_US'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment configuration')
}

export const env = parsed.data
export type Env = z.infer<typeof schema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/config/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/config/env.ts server/src/config/env.test.ts
git commit -m "feat(server): zod-validated env config"
```

---

### Task 4: AES-256-GCM-Krypto

**Files:**
- Create: `server/src/crypto/aes.ts`
- Test: `server/src/crypto/aes.test.ts`

- [ ] **Step 1: Write the failing test** — `server/src/crypto/aes.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from './aes.js'

describe('aes-256-gcm', () => {
  it('round-trips a string', () => {
    const plain = JSON.stringify({ username: 'a@b.c', password: 'p@ss' })
    const enc = encrypt(plain)
    expect(enc).not.toContain('p@ss')
    expect(decrypt(enc)).toBe(plain)
  })

  it('produces different ciphertext each call (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'))
  })

  it('throws on tampered ciphertext', () => {
    const enc = encrypt('secret')
    const buf = Buffer.from(enc, 'base64')
    buf[buf.length - 1] ^= 0xff
    expect(() => decrypt(buf.toString('base64'))).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/crypto/aes.test.ts`
Expected: FAIL — `Cannot find module './aes.js'`.

- [ ] **Step 3: Implement** — `server/src/crypto/aes.ts`

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const KEY = Buffer.from(env.MASTER_KEY, 'base64')

/** Encrypts a UTF-8 string. Output = base64(iv | authTag | ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, KEY, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

/** Reverses encrypt(). Throws if the auth tag does not verify. */
export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/crypto/aes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/crypto/aes.ts server/src/crypto/aes.test.ts
git commit -m "feat(server): aes-256-gcm encrypt/decrypt"
```

---

### Task 5: Vollständiges Drizzle-Schema + Migrationen

**Files:**
- Create: `server/src/db/schema.ts`
- Create: `server/drizzle.config.ts`
- Generated: `server/drizzle/*.sql` (via `db:generate`)

- [ ] **Step 1: Implement** — `server/src/db/schema.ts` (ALLE Tabellen für M1–M4)

```ts
import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const yazioAccounts = sqliteTable('yazio_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  label: text('label').notNull(),
  yazioUsername: text('yazio_username').notNull(),
  encCredentials: text('enc_credentials').notNull(),
  encTokens: text('enc_tokens'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull(),
})

export const aliases = sqliteTable(
  'aliases',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    normalizedName: text('normalized_name').notNull(),
    productId: text('product_id').notNull(),
    defaultServing: text('default_serving'),
    defaultServingQuantity: real('default_serving_quantity'),
    defaultAmountG: real('default_amount_g'),
    hits: integer('hits').notNull().default(1),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ uqUserName: unique().on(t.userId, t.normalizedName) }),
)

export const presets = sqliteTable(
  'presets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({ uqUserName: unique().on(t.userId, t.name) }),
)

export const presetItems = sqliteTable('preset_items', {
  id: text('id').primaryKey(),
  presetId: text('preset_id')
    .notNull()
    .references(() => presets.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  rawText: text('raw_text').notNull(),
  productId: text('product_id').notNull(),
  serving: text('serving'),
  servingQuantity: real('serving_quantity'),
  amountG: real('amount_g').notNull(),
})

export const logEvents = sqliteTable('log_events', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  yazioAccountId: text('yazio_account_id')
    .notNull()
    .references(() => yazioAccounts.id),
  date: text('date').notNull(), // YYYY-MM-DD
  daytime: text('daytime').notNull(), // breakfast|lunch|dinner|snack
  status: text('status').notNull(), // pending|logged|undone|error
  itemsJson: text('items_json').notNull(),
  consumedIdsJson: text('consumed_ids_json'),
  createdAt: integer('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
})
```

- [ ] **Step 2: Implement** — `server/drizzle.config.ts`

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
})
```

- [ ] **Step 3: Generate migrations**

Run: `cd server && npx drizzle-kit generate`
Expected: erzeugt `server/drizzle/0000_*.sql` + `server/drizzle/meta/`. Öffne die `.sql` und prüfe, dass alle 7 Tabellen (`users`, `yazio_accounts`, `aliases`, `presets`, `preset_items`, `log_events`, `sessions`) als `CREATE TABLE` enthalten sind.

- [ ] **Step 4: Commit**

```bash
git add server/src/db/schema.ts server/drizzle.config.ts server/drizzle
git commit -m "feat(server): full drizzle sqlite schema + initial migration"
```

---

### Task 6: DB-Client + Migrations-Runner + Test-DB-Helper

**Files:**
- Create: `server/src/db/client.ts`
- Create: `server/src/db/test-db.ts`
- Test: `server/src/db/client.test.ts`

- [ ] **Step 1: Write the failing test** — `server/src/db/client.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from './test-db.js'

describe('db client + migrations', () => {
  it('creates all 7 tables in an in-memory db', () => {
    const db = createTestDb()
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`,
    )
    const names = rows.map((r) => r.name).sort()
    expect(names).toEqual(
      ['aliases', 'log_events', 'preset_items', 'presets', 'sessions', 'users', 'yazio_accounts'].sort(),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/db/client.test.ts`
Expected: FAIL — `Cannot find module './test-db.js'`.

- [ ] **Step 3: Implement** — `server/src/db/client.ts`

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.js'

export type DB = BetterSQLite3Database<typeof schema>

const here = path.dirname(fileURLToPath(import.meta.url))
// src/db/* (tsx) und dist/db/* (build) liegen beide zwei Ebenen unter server/ → server/drizzle
export const MIGRATIONS_DIR = path.resolve(here, '../../drizzle')

export function createDb(dbPath: string): { db: DB; sqlite: Database.Database } {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

export function runMigrations(db: DB): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}
```

- [ ] **Step 4: Implement** — `server/src/db/test-db.ts`

```ts
import { createDb, runMigrations, type DB } from './client.js'

/** Fresh in-memory database with all migrations applied. */
export function createTestDb(): DB {
  const { db } = createDb(':memory:')
  runMigrations(db)
  return db
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/db/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/db/client.ts server/src/db/test-db.ts server/src/db/client.test.ts
git commit -m "feat(server): sqlite client, migration runner, test-db helper"
```

---

### Task 7: Passwort-Hashing (argon2)

**Files:**
- Create: `server/src/modules/auth/password.ts`
- Test: `server/src/modules/auth/password.test.ts`

- [ ] **Step 1: Write the failing test** — `server/src/modules/auth/password.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash).not.toContain('correct horse')
    expect(await verifyPassword(hash, 'correct horse')).toBe(true)
    expect(await verifyPassword(hash, 'wrong')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/modules/auth/password.test.ts`
Expected: FAIL — `Cannot find module './password.js'`.

- [ ] **Step 3: Implement** — `server/src/modules/auth/password.ts`

```ts
import argon2 from 'argon2'

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/modules/auth/password.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth/password.ts server/src/modules/auth/password.test.ts
git commit -m "feat(server): argon2 password hashing"
```

---

### Task 8: Users-Repository

**Files:**
- Create: `server/src/modules/auth/users.repo.ts`
- Test: `server/src/modules/auth/users.repo.test.ts`

- [ ] **Step 1: Write the failing test** — `server/src/modules/auth/users.repo.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser, findUserByUsername, findUserById } from './users.repo.js'

describe('users repo', () => {
  it('creates and finds a user by username and id', async () => {
    const db = createTestDb()
    const created = await createUser(db, 'jens', 'pw-123456')
    expect(created.id).toMatch(/[0-9a-f-]{36}/)

    const byName = findUserByUsername(db, 'jens')
    expect(byName?.username).toBe('jens')
    expect(byName?.passwordHash).not.toBe('pw-123456')

    const byId = findUserById(db, created.id)
    expect(byId?.username).toBe('jens')
  })

  it('rejects a duplicate username', async () => {
    const db = createTestDb()
    await createUser(db, 'dup', 'pw-123456')
    await expect(createUser(db, 'dup', 'pw-123456')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/modules/auth/users.repo.test.ts`
Expected: FAIL — `Cannot find module './users.repo.js'`.

- [ ] **Step 3: Implement** — `server/src/modules/auth/users.repo.ts`

```ts
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { hashPassword } from './password.js'

export interface PublicUser {
  id: string
  username: string
}

export async function createUser(db: DB, username: string, password: string): Promise<PublicUser> {
  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  db.insert(users).values({ id, username, passwordHash, createdAt: Date.now() }).run()
  return { id, username }
}

export function findUserByUsername(db: DB, username: string) {
  return db.select().from(users).where(eq(users.username, username)).get()
}

export function findUserById(db: DB, id: string) {
  return db.select().from(users).where(eq(users.id, id)).get()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/modules/auth/users.repo.test.ts`
Expected: PASS (2 tests). Der Duplicate-Test schlägt fehl, weil der `UNIQUE`-Constraint auf `username` greift (better-sqlite3 wirft).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth/users.repo.ts server/src/modules/auth/users.repo.test.ts
git commit -m "feat(server): users repository"
```

---

### Task 9: Sessions-Modul

**Files:**
- Create: `server/src/modules/auth/sessions.ts`
- Test: `server/src/modules/auth/sessions.test.ts`

- [ ] **Step 1: Write the failing test** — `server/src/modules/auth/sessions.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from './users.repo.js'
import { sessions as sessionsTable } from '../../db/schema.js'
import { createSession, getSession, deleteSession } from './sessions.js'

describe('sessions', () => {
  it('creates, fetches and deletes a session', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'jens', 'pw-123456')

    const session = createSession(db, user.id)
    expect(session.id).toMatch(/[0-9a-f-]{36}/)
    expect(getSession(db, session.id)?.userId).toBe(user.id)

    deleteSession(db, session.id)
    expect(getSession(db, session.id)).toBeNull()
  })

  it('returns null for an expired session', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'exp', 'pw-123456')
    const id = randomUUID()
    db.insert(sessionsTable).values({ id, userId: user.id, expiresAt: Date.now() - 1000 }).run()
    expect(getSession(db, id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/modules/auth/sessions.test.ts`
Expected: FAIL — `Cannot find module './sessions.js'`.

- [ ] **Step 3: Implement** — `server/src/modules/auth/sessions.ts`

```ts
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { sessions } from '../../db/schema.js'

export const SESSION_COOKIE = 'sid'
const TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 Tage

export interface Session {
  id: string
  userId: string
  expiresAt: number
}

export function createSession(db: DB, userId: string): Session {
  const id = randomUUID()
  const expiresAt = Date.now() + TTL_MS
  db.insert(sessions).values({ id, userId, expiresAt }).run()
  return { id, userId, expiresAt }
}

export function getSession(db: DB, id: string): Session | null {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!row) return null
  if (row.expiresAt < Date.now()) {
    db.delete(sessions).where(eq(sessions.id, id)).run()
    return null
  }
  return row
}

export function deleteSession(db: DB, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/modules/auth/sessions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth/sessions.ts server/src/modules/auth/sessions.test.ts
git commit -m "feat(server): server-side sessions"
```

---

### Task 10: App-Factory + Error-Handler + Auth-Guard

**Files:**
- Create: `server/src/http/errors.ts`
- Create: `server/src/http/auth-guard.ts`
- Create: `server/src/app.ts`
- Test: `server/src/app.test.ts`

- [ ] **Step 1: Write the failing test** — `server/src/app.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createTestDb } from './db/test-db.js'
import { buildApp } from './app.js'

describe('app factory', () => {
  it('wires the health route', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('treats unauthenticated requests as anonymous (no user)', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/app.test.ts`
Expected: FAIL — `Cannot find module './app.js'`.

- [ ] **Step 3: Implement** — `server/src/http/errors.ts`

```ts
import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: 'validation_error', details: error.flatten() })
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: error.message })
    }
    app.log.error(error)
    return reply.status(500).send({ error: 'internal_error' })
  })
}
```

- [ ] **Step 4: Implement** — `server/src/http/auth-guard.ts`

```ts
import type { FastifyReply, FastifyRequest } from 'fastify'

/** preHandler for protected routes — used by M2+ feature routes. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    await reply.status(401).send({ error: 'unauthenticated' })
  }
}
```

- [ ] **Step 5: Implement** — `server/src/app.ts`

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import type { DB } from './db/client.js'
import { getSession, SESSION_COOKIE } from './modules/auth/sessions.js'
import { registerErrorHandler } from './http/errors.js'
import { registerHealthRoutes } from './http/routes/health.routes.js'
import { registerAuthRoutes } from './http/routes/auth.routes.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string } | null
  }
}

export function buildApp(db: DB): FastifyInstance {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' })

  app.register(cookie, { secret: env.SESSION_SECRET })
  app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

  app.decorateRequest('user', null)

  // Resolve the session cookie into req.user for every request.
  app.addHook('preHandler', async (req) => {
    req.user = null
    const raw = req.cookies[SESSION_COOKIE]
    if (!raw) return
    const unsigned = req.unsignCookie(raw)
    if (!unsigned.valid || !unsigned.value) return
    const session = getSession(db, unsigned.value)
    if (session) req.user = { id: session.userId }
  })

  registerErrorHandler(app)
  registerHealthRoutes(app)
  registerAuthRoutes(app, db)

  return app
}
```

> `registerAuthRoutes` existiert noch nicht — Task 11 erstellt sie. Dieser Test schlägt bis dahin beim Import fehl; das ist erwartet. Wer streng TDD-sequenziell arbeitet, kann Task 11 direkt anschließen und beide zusammen grün machen.

- [ ] **Step 6: Commit (zusammen mit Task 11)**

> App-Factory + Auth-Routen werden gemeinsam in Task 11 grün gemacht und committet.

---

### Task 11: Auth-Routen (bootstrap, login, logout, me)

**Files:**
- Create: `server/src/http/routes/auth.routes.ts`
- Test: `server/src/http/routes/auth.routes.test.ts`

- [ ] **Step 1: Write the failing test** — `server/src/http/routes/auth.routes.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'

const BOOTSTRAP = 'test-bootstrap-token' // = test/setup.ts ADMIN_BOOTSTRAP

async function bootstrap(app: ReturnType<typeof buildApp>, username = 'jens', password = 'pw-123456') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { token: BOOTSTRAP, username, password },
  })
}

describe('auth routes', () => {
  it('rejects bootstrap with a wrong token', async () => {
    const app = buildApp(createTestDb())
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { token: 'nope', username: 'x', password: 'pw-123456' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('creates a user, logs in, reads me, logs out', async () => {
    const app = buildApp(createTestDb())

    const created = await bootstrap(app)
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ username: 'jens' })

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'jens', password: 'pw-123456' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find((c) => c.name === 'sid')
    expect(cookie).toBeTruthy()
    const cookieHeader = `sid=${cookie!.value}`

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieHeader } })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ username: 'jens' })

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookieHeader } })
    expect(logout.statusCode).toBe(204)

    const meAfter = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieHeader } })
    expect(meAfter.statusCode).toBe(401)
  })

  it('rejects login with a wrong password', async () => {
    const app = buildApp(createTestDb())
    await bootstrap(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'jens', password: 'WRONG' },
    })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/http/routes/auth.routes.test.ts`
Expected: FAIL — `Cannot find module './auth.routes.js'` (und `app.ts`-Import bricht).

- [ ] **Step 3: Implement** — `server/src/http/routes/auth.routes.ts`

```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../config/env.js'
import type { DB } from '../../db/client.js'
import { createUser, findUserByUsername, findUserById } from '../../modules/auth/users.repo.js'
import { verifyPassword } from '../../modules/auth/password.js'
import { createSession, deleteSession, SESSION_COOKIE } from '../../modules/auth/sessions.js'

const BootstrapSchema = z.object({
  token: z.string(),
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(256),
})

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export function registerAuthRoutes(app: FastifyInstance, db: DB): void {
  app.post('/api/auth/bootstrap', async (req, reply) => {
    const body = BootstrapSchema.parse(req.body)
    if (body.token !== env.ADMIN_BOOTSTRAP) {
      return reply.status(403).send({ error: 'forbidden' })
    }
    if (findUserByUsername(db, body.username)) {
      return reply.status(409).send({ error: 'username_taken' })
    }
    const user = await createUser(db, body.username, body.password)
    return reply.status(201).send(user)
  })

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = LoginSchema.parse(req.body)
      const user = findUserByUsername(db, body.username)
      if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
        return reply.status(401).send({ error: 'invalid_credentials' })
      }
      const session = createSession(db, user.id)
      reply.setCookie(SESSION_COOKIE, session.id, {
        signed: true,
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
      return reply.status(200).send({ id: user.id, username: user.username })
    },
  )

  app.post('/api/auth/logout', async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE]
    if (raw) {
      const unsigned = req.unsignCookie(raw)
      if (unsigned.valid && unsigned.value) deleteSession(db, unsigned.value)
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.status(204).send()
  })

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'unauthenticated' })
    const user = findUserById(db, req.user.id)
    if (!user) return reply.status(401).send({ error: 'unauthenticated' })
    return reply.send({ id: user.id, username: user.username })
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/app.test.ts src/http/routes/auth.routes.test.ts`
Expected: PASS (app factory + alle Auth-Tests). `@fastify/cookie` signiert/unsigniert das `sid`-Cookie; `inject` gibt es über `res.cookies` zurück.

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts server/src/app.test.ts server/src/http/errors.ts server/src/http/auth-guard.ts server/src/http/routes/auth.routes.ts server/src/http/routes/auth.routes.test.ts
git commit -m "feat(server): app factory + bootstrap/login/logout/me auth routes"
```

---

### Task 12: Server-Entry + Migrate-CLI + Smoke-Run

**Files:**
- Create: `server/src/index.ts`
- Create: `server/src/db/migrate-cli.ts`

- [ ] **Step 1: Implement** — `server/src/db/migrate-cli.ts`

```ts
import { createDb, runMigrations } from './client.js'
import { env } from '../config/env.js'

const { db } = createDb(env.DATABASE_PATH)
runMigrations(db)
console.log(`Migrations applied to ${env.DATABASE_PATH}`)
```

- [ ] **Step 2: Implement** — `server/src/index.ts`

```ts
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { env } from './config/env.js'
import { createDb, runMigrations } from './db/client.js'
import { buildApp } from './app.js'

function ensureDbDir(dbPath: string): void {
  if (dbPath === ':memory:') return
  mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true })
}

async function main(): Promise<void> {
  ensureDbDir(env.DATABASE_PATH)
  const { db } = createDb(env.DATABASE_PATH)
  runMigrations(db)

  const app = buildApp(db)
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`Eazio server listening on :${env.PORT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 3: Typecheck + full test suite**

Run: `cd server && npx tsc -p tsconfig.json --noEmit && npx vitest run`
Expected: Typecheck ohne Fehler; **alle** Tests grün.

- [ ] **Step 4: Manueller Smoke-Test (lokal, optional aber empfohlen)**

```bash
# Echte ENV bereitstellen (z.B. .env im Repo-Root für Dev):
node -e "console.log('MASTER_KEY='+require('crypto').randomBytes(32).toString('base64'))"
# .env mit MASTER_KEY, SESSION_SECRET, ADMIN_BOOTSTRAP, DATABASE_PATH=./data/eazio.db, COOKIE_SECURE=false füllen
cd server && npx tsx src/index.ts
# In zweitem Terminal:
curl -s localhost:3000/api/health
curl -s -X POST localhost:3000/api/auth/bootstrap -H 'content-type: application/json' \
  -d '{"token":"<ADMIN_BOOTSTRAP>","username":"jens","password":"pw-123456"}'
```
Expected: `{"status":"ok"}` und `201` mit `{id, username}`.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/src/db/migrate-cli.ts
git commit -m "feat(server): server entrypoint + migrate cli"
```

---

## Self-Review (gegen Spec & Roadmap)

**Spec-Coverage (M1-Teil):**
- App-Login (argon2, Session-Cookie, Rate-Limit auf Login) → Tasks 7,9,11. ✅
- Yazio-Creds AES-256-GCM → Task 4 (Schema-Felder `enc_credentials`/`enc_tokens` in Task 5; Nutzung in M2). ✅
- Nutzeranlage via `ADMIN_BOOTSTRAP` (kein Public-Signup) → Task 11. ✅
- Vollständiges Datenmodell (alle 7 Tabellen) → Task 5. ✅
- `zod`-Validierung an Grenzen → Tasks 3, 11 + Error-Handler Task 10. ✅
- `.env` nie committen, `.env.example` mitliefern → Tasks 1 (.gitignore, .env.example). ✅

**Bewusst NICHT in M1 (spätere Milestones):** Yazio-Client/Konten (M2), Parsing/Matching/Lernen (M3), Logging/Presets/daytime (M4), Frontend (M5), Docker/NPM/Deploy (M6).

**Placeholder-Scan:** kein TBD/TODO in Code-Schritten; jeder Code-Schritt enthält vollständigen Code. ✅ (Der zweite Sessions-Test in Task 9 hat eine empfohlene, vollständige Ersatz-Variante — diese verwenden.)

**Typ-Konsistenz:** `DB` (client.ts) einheitlich genutzt; `SESSION_COOKIE` zentral in sessions.ts; `req.user: {id}|null` via `declare module` in app.ts; Repo-Funktionsnamen (`createUser`, `findUserByUsername`, `findUserById`, `createSession`, `getSession`, `deleteSession`) über Tasks hinweg identisch. ✅

**Hinweis für M6:** Im Docker-Image muss `server/drizzle` (Migrationen) neben dem kompilierten `dist` so liegen, dass `MIGRATIONS_DIR = resolve(dirname(dist/db/client.js), '../../drizzle')` darauf zeigt (⇒ `server/drizzle`). Das wird im M6-Dockerfile berücksichtigt.
