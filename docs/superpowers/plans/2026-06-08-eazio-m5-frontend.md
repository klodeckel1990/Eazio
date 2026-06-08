# Eazio M5 — Frontend SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. `- [ ]` checkboxes.

**Goal:** A React/Vite single-page app (in a new `web/` workspace) that lets a logged-in user: paste free-text ingredients → review/correct the matched products (per-line dropdown of candidates with live-scaled nutrients + editable grams) → pick meal + Yazio account → log to Yazio with an undo; manage linked Yazio accounts; save/load named presets. The backend serves the built SPA.

**Architecture:** `web/` Vite+React+TS workspace. Typed API client over the existing `/api/*` backend (cookie session, `credentials: 'include'`). React Router for pages (Login, Tracker, Accounts, Presets). Auth via a small React context that calls `/api/auth/me`. The Fastify server serves `web/dist` as static with an SPA fallback (wired in Group D).

**Tech:** React 19, Vite (latest), react-router-dom 7, TypeScript (Bundler resolution — **no `.js` import suffixes in web/**, unlike the server), Vitest + jsdom + @testing-library/react + user-event. No heavy UI library — a single global stylesheet.

**Reference:** backend endpoints (all built & tested): `/api/auth/{me,login,logout}`, `/api/accounts` (GET/POST, PATCH `/:id/default`, DELETE `/:id`), `/api/match` (POST → `{accountId, lines}`), `/api/log` (POST → `{logId,count,date,daytime,accountId}`), `/api/log/:id/undo` (POST → 204), `/api/presets` (GET/POST, GET/DELETE `/:id`).

## Backend response shapes (mirror these as TS types)
- `Account = { id, label, yazioUsername, isDefault }`
- `MatchResponse = { accountId, lines: MatchLine[] }`
- `MatchLine = { raw, name, qty: number|null, unit: 'g'|'ml'|'serving', amountGrams: number|null, candidates: Candidate[], selectedProductId: string|null }`
- `Candidate = { productId, name, producer, isVerified, baseUnit, referenceAmount, serving, servingQuantity, nutrientsPerReference: { kcal, carb, protein, fat } }`
- `LogResult = { logId, count, date, daytime, accountId }`
- `Preset = { id, name }`; `PresetWithItems = { id, name, items: { position, rawText, productId, serving, servingQuantity, amountG }[] }`

## File structure (new `web/`)
```
web/
  package.json  tsconfig.json  vite.config.ts  index.html  .gitignore (dist)
  src/
    main.tsx  App.tsx  styles.css
    test/setup.ts
    api/client.ts  api/client.test.ts  api/types.ts
    lib/nutrition.ts  lib/nutrition.test.ts  lib/daytime.ts
    auth/AuthContext.tsx  auth/AuthContext.test.tsx  auth/ProtectedRoute.tsx
    pages/LoginPage.tsx  pages/TrackerPage.tsx  pages/AccountsPage.tsx  pages/PresetsPage.tsx
    components/Nav.tsx  components/IngredientRow.tsx  components/IngredientRow.test.tsx
```

Conventions: `web/` uses Vite Bundler resolution → relative imports have **NO** `.js` suffix. Verify with `npm run typecheck -w web` + `npm run test -w web`. The whole repo: `npm test` runs both workspaces.

---

### Task 1: web scaffold + root wiring

**Files:** root `package.json` (add `web`); `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/.gitignore`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/styles.css`, `web/src/test/setup.ts`.

- [ ] **Step 1: Root `package.json`** — add `web` to workspaces and fan out scripts:
```json
{
  "workspaces": ["server", "web"],
  "scripts": {
    "dev": "npm run dev --workspace server",
    "build": "npm run build --workspace web && npm run build --workspace server",
    "test": "npm run test --workspace server && npm run test --workspace web",
    "lint": "npm run typecheck --workspace server && npm run typecheck --workspace web"
  }
}
```

- [ ] **Step 2: Create `web/package.json`** then install:
```json
{
  "name": "@eazio/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```
Install (repo root):
```
npm install -w web react react-dom react-router-dom
npm install -w web -D vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/react @types/react-dom
```

- [ ] **Step 3: `web/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `web/vite.config.ts`**
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] },
})
```

- [ ] **Step 5: `web/src/test/setup.ts`**
```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 6: `web/index.html`**
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eazio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: `web/.gitignore`** → `dist`

- [ ] **Step 8: `web/src/styles.css`** — a minimal clean stylesheet (system font, container max-width 720px, basic form/table/button styles, a `.muted`, `.error`, `.badge` helper). Keep it simple and readable.

- [ ] **Step 9: `web/src/main.tsx`** (App rendered, router added in Task 3 — for now render App)
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 10: `web/src/App.tsx`** (placeholder; replaced in Task 3)
```tsx
export function App() {
  return <h1>Eazio</h1>
}
```

- [ ] **Step 11: Verify + commit**
Run `npm run typecheck -w web` (clean) and `npm run build -w web` (emits `web/dist`). Commit: `feat(web): scaffold vite + react workspace`

---

### Task 2: API types, client, nutrition + daytime utils

**Files:** `web/src/api/types.ts`, `web/src/api/client.ts` (+ `.test.ts`), `web/src/lib/nutrition.ts` (+ `.test.ts`), `web/src/lib/daytime.ts`.

- [ ] **Step 1: `web/src/api/types.ts`**
```ts
export interface User { id: string; username: string }
export interface Account { id: string; label: string; yazioUsername: string; isDefault: boolean }
export interface Nutrition { kcal: number; carb: number; protein: number; fat: number }
export type Daytime = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Candidate {
  productId: string
  name: string
  producer: string
  isVerified: boolean
  baseUnit: string
  referenceAmount: number
  serving: string
  servingQuantity: number
  nutrientsPerReference: Nutrition
}
export interface MatchLine {
  raw: string
  name: string
  qty: number | null
  unit: 'g' | 'ml' | 'serving'
  amountGrams: number | null
  candidates: Candidate[]
  selectedProductId: string | null
}
export interface MatchResponse { accountId: string; lines: MatchLine[] }
export interface LogResult { logId: string; count: number; date: string; daytime: Daytime; accountId: string }
export interface LogLine { productId: string; name: string; amountGrams: number; serving?: string | null; servingQuantity?: number | null }
export interface Preset { id: string; name: string }
export interface PresetItem { position: number; rawText: string; productId: string; serving: string | null; servingQuantity: number | null; amountG: number }
export interface PresetWithItems extends Preset { items: PresetItem[] }
```

- [ ] **Step 2: Failing test** — `web/src/api/client.test.ts`
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, ApiError } from './client'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) }
}

describe('api client', () => {
  it('GET /auth/me returns the user and sends credentials', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: 'u1', username: 'jens' }))
    const user = await api.auth.me()
    expect(user).toEqual({ id: 'u1', username: 'jens' })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }))
  })

  it('POST sends JSON body + content-type', async () => {
    fetchMock.mockResolvedValueOnce(ok({ accountId: 'a1', lines: [] }))
    await api.match('80g Haferflocken')
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ text: '80g Haferflocken', accountId: undefined })
    expect(init.headers['content-type']).toBe('application/json')
  })

  it('throws ApiError with status + error code on failure', async () => {
    fetchMock.mockResolvedValueOnce(ok({ error: 'no_account' }, 409))
    await expect(api.match('x')).rejects.toMatchObject({ status: 409, message: 'no_account' })
    await expect(api.match('x')).rejects.toBeInstanceOf(ApiError) // (separate call)
  })

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) })
    await expect(api.auth.logout()).resolves.toBeUndefined()
  })
})
```
> Note: the second 409 expectation makes a second call — mock another rejection; or simplify to one assertion. Keep the test green; the point is ApiError(status, errorCode).

- [ ] **Step 3: Implement** — `web/src/api/client.ts`
```ts
import type {
  Account, LogLine, LogResult, MatchResponse, Preset, PresetWithItems, User, Daytime,
} from './types'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = (data as { error?: string }).error ?? `http_${res.status}`
    throw new ApiError(res.status, code)
  }
  return data as T
}

export const api = {
  auth: {
    me: () => req<User>('GET', '/auth/me'),
    login: (username: string, password: string) => req<User>('POST', '/auth/login', { username, password }),
    logout: () => req<void>('POST', '/auth/logout'),
  },
  accounts: {
    list: () => req<Account[]>('GET', '/accounts'),
    link: (label: string, username: string, password: string) =>
      req<Account>('POST', '/accounts', { label, username, password }),
    setDefault: (id: string) => req<void>('PATCH', `/accounts/${id}/default`),
    remove: (id: string) => req<void>('DELETE', `/accounts/${id}`),
  },
  match: (text: string, accountId?: string) => req<MatchResponse>('POST', '/match', { text, accountId }),
  log: (payload: { accountId?: string; date?: string; daytime?: Daytime; lines: LogLine[] }) =>
    req<LogResult>('POST', '/log', payload),
  undo: (logId: string) => req<void>('POST', `/log/${logId}/undo`),
  presets: {
    list: () => req<Preset[]>('GET', '/presets'),
    create: (name: string, items: Omit<PresetWithItems['items'][number], 'position'>[]) =>
      req<Preset>('POST', '/presets', { name, items }),
    get: (id: string) => req<PresetWithItems>('GET', `/presets/${id}`),
    remove: (id: string) => req<void>('DELETE', `/presets/${id}`),
  },
}
```
Run (PASS): `npm run test -w web -- src/api/client.test.ts`

- [ ] **Step 4: nutrition util** — `web/src/lib/nutrition.ts` (+ `.test.ts`)
```ts
import type { Nutrition } from '../api/types'

export function scaleNutrition(per: Nutrition, referenceAmount: number, grams: number): Nutrition {
  if (referenceAmount <= 0) return { kcal: 0, carb: 0, protein: 0, fat: 0 }
  const f = grams / referenceAmount
  return { kcal: per.kcal * f, carb: per.carb * f, protein: per.protein * f, fat: per.fat * f }
}

export const round = (n: number): number => Math.round(n * 10) / 10
```
Test:
```ts
import { describe, it, expect } from 'vitest'
import { scaleNutrition } from './nutrition'

describe('scaleNutrition', () => {
  it('scales per-reference nutrients to grams', () => {
    const per = { kcal: 350, carb: 60, protein: 12, fat: 7 }
    expect(scaleNutrition(per, 100, 80)).toEqual({ kcal: 280, carb: 48, protein: 9.6, fat: 5.6 })
  })
  it('guards a zero reference amount', () => {
    expect(scaleNutrition({ kcal: 1, carb: 1, protein: 1, fat: 1 }, 0, 50)).toEqual({ kcal: 0, carb: 0, protein: 0, fat: 0 })
  })
})
```

- [ ] **Step 5: daytime util** — `web/src/lib/daytime.ts`
```ts
import type { Daytime } from '../api/types'

export const DAYTIME_LABELS: Record<Daytime, string> = {
  breakfast: 'Frühstück', lunch: 'Mittag', dinner: 'Abend', snack: 'Snack',
}

export function defaultDaytime(now: Date = new Date()): Daytime {
  const h = now.getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 15 && h < 21) return 'dinner'
  return 'snack'
}
```

- [ ] **Step 6: Verify + commit**
`npm run typecheck -w web` + `npm run test -w web` green. Commit: `feat(web): typed api client + nutrition/daytime utils`

---

### Task 3: Auth context + login + routing shell

**Files:** `web/src/auth/AuthContext.tsx` (+ `.test.tsx`), `web/src/auth/ProtectedRoute.tsx`, `web/src/pages/LoginPage.tsx`, `web/src/components/Nav.tsx`, replace `web/src/App.tsx`.

- [ ] **Step 1: `AuthContext.tsx`** — provides `{ user, loading, login, logout, refresh }`. On mount calls `api.auth.me()` (catch → user null). `login` calls `api.auth.login` then sets user. `logout` calls `api.auth.logout` then clears.
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false))
  }, [])

  const login = async (username: string, password: string) => {
    setUser(await api.auth.login(username, password))
  }
  const logout = async () => {
    await api.auth.logout().catch((e) => { if (!(e instanceof ApiError)) throw e })
    setUser(null)
  }
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
```

- [ ] **Step 2: Failing test** — `AuthContext.test.tsx` (mock the api client module): assert it loads the user from `api.auth.me`, and `login` updates the user. Use `@testing-library/react` `render` + a tiny consumer component.
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../api/client', () => ({
  ApiError: class extends Error {},
  api: {
    auth: {
      me: vi.fn().mockRejectedValue(new Error('401')),
      login: vi.fn().mockResolvedValue({ id: 'u1', username: 'jens' }),
      logout: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

function Probe() {
  const { user, loading, login } = useAuth()
  if (loading) return <p>loading</p>
  return (
    <div>
      <span>user:{user?.username ?? 'none'}</span>
      <button onClick={() => login('jens', 'pw')}>login</button>
    </div>
  )
}

describe('AuthContext', () => {
  it('starts anonymous then logs in', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText('user:none')).toBeInTheDocument())
    await userEvent.click(screen.getByText('login'))
    await waitFor(() => expect(screen.getByText('user:jens')).toBeInTheDocument())
  })
})
```
Run (FAIL → implement context → PASS).

- [ ] **Step 3: `ProtectedRoute.tsx`** — if `loading` show a spinner/text; if no `user` `<Navigate to="/login" />`; else `<Outlet />`.

- [ ] **Step 4: `LoginPage.tsx`** — a form (username, password) calling `login`; on `ApiError` show "Anmeldung fehlgeschlagen"; on success `navigate('/')`. If already logged in, redirect to `/`.

- [ ] **Step 5: `Nav.tsx`** — links Tracker `/`, Konten `/accounts`, Presets `/presets`, and a logout button showing the username.

- [ ] **Step 6: Replace `App.tsx`** — wrap in `BrowserRouter` + `AuthProvider`; routes: `/login` → LoginPage; protected layout (Nav + Outlet) for `/` (TrackerPage), `/accounts` (AccountsPage), `/presets` (PresetsPage). Import the page components (created in Tasks 4-5; for THIS task, stub TrackerPage/AccountsPage/PresetsPage as simple placeholders that say their name, then flesh out later). Keep the router final here.

- [ ] **Step 7: Verify + commit**
`npm run typecheck -w web` + `npm run test -w web` green. Commit: `feat(web): auth context, login, protected routing`

---

### Task 4: Tracker page (the core flow)

**Files:** `web/src/components/IngredientRow.tsx` (+ `.test.tsx`), `web/src/pages/TrackerPage.tsx`.

Behaviour:
- On mount: `api.accounts.list()`. If none → show "Erst ein Yazio-Konto verknüpfen" with a link to `/accounts`. Else default account = the `isDefault` one (selectable).
- A textarea + "Matchen" button → `api.match(text, accountId)`. While loading show a spinner. On `ApiError` 409 → prompt to add account.
- Render the returned `lines` as editable rows (one `IngredientRow` each). Per row state: selected `productId` (dropdown of `candidates`), `grams` (number input; initial = `amountGrams ?? selectedCandidate.referenceAmount`). Show live nutrients via `scaleNutrition(candidate.nutrientsPerReference, candidate.referenceAmount, grams)` (rounded). Allow removing a row.
- A meal `<select>` (default `defaultDaytime()`, labels from `DAYTIME_LABELS`) and the account selector. A "Loggen" button → `api.log({ accountId, daytime, lines: rows.map(r => ({ productId: r.productId, name: r.name, amountGrams: r.grams })) })`. On success show "✓ N Einträge geloggt (Mahlzeit)" + an "Rückgängig" button calling `api.undo(logId)`.
- A "Als Preset speichern" button (prompt for a name) → `api.presets.create(name, rows.map(r => ({ rawText: r.raw, productId: r.productId, amountG: r.grams, serving: null, servingQuantity: null })))`.

- [ ] **Step 1: `IngredientRow.tsx`** — props: `line: MatchLine`, `value: { productId, grams }`, `onChange`, `onRemove`. Renders the product `<select>` (candidates), a grams number input, and a nutrient summary computed from the selected candidate + grams. Pure-ish (state lifted to TrackerPage).

- [ ] **Step 2: Failing test** — `IngredientRow.test.tsx`: given a line with 2 candidates (ref 100g, 350 kcal) and grams 80, it shows "280 kcal"; changing the grams input to 100 shows "350 kcal"; changing the product dropdown calls onChange with the new productId.
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IngredientRow } from './IngredientRow'
import type { MatchLine } from '../api/types'

const cand = (id: string, kcal: number) => ({
  productId: id, name: `P-${id}`, producer: 'ACME', isVerified: true,
  baseUnit: 'g', referenceAmount: 100, serving: 'portion', servingQuantity: 1,
  nutrientsPerReference: { kcal, carb: 60, protein: 12, fat: 7 },
})
const line: MatchLine = {
  raw: '80g Haferflocken', name: 'Haferflocken', qty: 80, unit: 'g', amountGrams: 80,
  candidates: [cand('p1', 350), cand('p2', 500)], selectedProductId: 'p1',
}

describe('IngredientRow', () => {
  it('shows nutrients scaled to grams and reacts to changes', async () => {
    const onChange = vi.fn()
    render(<IngredientRow line={line} value={{ productId: 'p1', grams: 80 }} onChange={onChange} onRemove={() => {}} />)
    expect(screen.getByText(/280/)).toBeInTheDocument() // 350 * 80/100
    const grams = screen.getByLabelText(/gramm/i)
    await userEvent.clear(grams)
    await userEvent.type(grams, '100')
    expect(onChange).toHaveBeenCalled() // grams change bubbles up
  })
})
```
> Lift state to the page so `onChange` is the assertion surface; the page recomputes display. (Adapt the test to your final controlled-component shape — the contract is: nutrients reflect grams, and product/grams edits call `onChange`.)

- [ ] **Step 3: Implement `IngredientRow.tsx` + `TrackerPage.tsx`**, run tests green. Commit: `feat(web): tracker page with interactive matching + log/undo`

---

### Task 5: Accounts + Presets pages

**Files:** `web/src/pages/AccountsPage.tsx`, `web/src/pages/PresetsPage.tsx` (+ optional tests).

- [ ] **AccountsPage:** list accounts (`api.accounts.list`); a form to link a new one (label, Yazio username, password) → `api.accounts.link` (on `ApiError` 400 → "Yazio-Login fehlgeschlagen"); "Als Standard" button → `api.accounts.setDefault`; "Entfernen" → `api.accounts.remove`. Refresh list after each action. A small test: linking calls `api.accounts.link` and the new account appears (mock the client).
- [ ] **PresetsPage:** list presets (`api.presets.list`); "Löschen" → `api.presets.remove`. (Loading a preset INTO the tracker is triggered from the Tracker page via a preset picker that calls `api.presets.get` and prefills rows — add a simple preset `<select>` on the Tracker that loads a preset's items as rows. If that is too large for this task, expose presets list here and a "Im Tracker laden" link that passes the preset id to the tracker via router state; keep it working end-to-end.)
- [ ] Verify + commit: `feat(web): accounts and presets pages`

---

### Task 6: Serve the SPA from Fastify + final wiring

**Files:** modify `server/src/app.ts` (serve `web/dist` + SPA fallback); `server/package.json` already has `@fastify/static`.

- [ ] **Step 1:** In `app.ts`, after the API routes, register static serving of the web build with an SPA fallback so client-side routes work:
```ts
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fastifyStatic from '@fastify/static'

// inside buildApp, after the API route registrations:
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist')
if (existsSync(webDir)) {
  app.register(fastifyStatic, { root: webDir, wildcard: false })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not_found' })
    return reply.sendFile('index.html')
  })
}
```
> `existsSync` from `node:fs`. Guard with `existsSync` so tests (no build present) and dev still work — when `web/dist` is absent the SPA serving is simply skipped and the API behaves as before. Keep the API 404 JSON for `/api/*`. Confirm the full server test suite still passes (no regression).
- [ ] **Step 2:** Verify `npm run typecheck -w server` + `npm run test -w server` green; `npm run build` (root) builds web then server. Commit: `feat(server): serve web SPA with fallback`

---

## Self-Review (M5 scope)
- Vite+React+TS workspace, builds; root build/test fan out to both → Task 1,6. ✅
- Typed API client (cookie auth) + nutrition/daytime utils, tested → Task 2. ✅
- Auth context + login + protected routing → Task 3. ✅
- Tracker: paste → match → correct (dropdown + grams + live nutrients) → meal/account → log → undo → save preset → Task 4. ✅
- Accounts + Presets management → Task 5. ✅
- Backend serves the SPA (with API 404 JSON preserved) → Task 6. ✅

**Forward (M6):** the Dockerfile builds `web` then `server`, copies `web/dist` next to the server so `../../web/dist` resolves, and runs the server which serves both API and SPA behind Nginx Proxy Manager.
