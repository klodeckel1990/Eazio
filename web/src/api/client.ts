import type {
  Account, AuthResponse, Candidate, LogLine, LogResult, MatchResponse, Preset, PresetWithItems, User, Daytime,
  ImportedRecipe, RecipeSummary, RecipeDetail, RecipeIngredient, UserSettings,
  DiaryDay, DiaryLogLine, DiaryLogResult, DiaryEntry, FoodMatchLine, FoodSummary, Goals,
} from './types'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// Same-origin ('' = relative /api) on the web; the Capacitor build bakes in an
// absolute URL via VITE_API_BASE.
const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''
const TOKEN_KEY = 'eazio.token'

// Storage access can throw (private mode) or be absent (tests) — degrade to
// an in-memory token rather than crashing on import.
function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

let token: string | null = readStoredToken()

export function setToken(next: string | null): void {
  token = next
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // in-memory only
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // A 401 with a token means the session was revoked or expired server-side.
    if (res.status === 401 && token && path !== '/auth/login') setToken(null)
    const code = (data as { error?: string }).error ?? `http_${res.status}`
    throw new ApiError(res.status, code)
  }
  return data as T
}

export const api = {
  auth: {
    me: () => req<User>('GET', '/auth/me'),
    login: (username: string, password: string) =>
      req<AuthResponse>('POST', '/auth/login', { username, password, platform: 'web' }),
    register: (username: string, email: string, password: string) =>
      req<AuthResponse>('POST', '/auth/register', { username, email, password, platform: 'web' }),
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
  search: (query: string, accountId?: string) =>
    req<{ accountId: string; candidates: Candidate[] }>('POST', '/search', { query, accountId }),
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
  recipes: {
    import: (input: { url?: string; text?: string }) =>
      req<ImportedRecipe>('POST', '/recipes/import', input),
    create: (recipe: {
      title: string | null
      servings: number | null
      sourceUrl: string | null
      sourceType: 'link' | 'text'
      imageUrl: string | null
      difficulty: string | null
      totalMinutes: number | null
      ingredients: RecipeIngredient[]
      steps: string[]
    }) => req<RecipeSummary>('POST', '/recipes', recipe),
    list: () => req<RecipeSummary[]>('GET', '/recipes'),
    get: (id: string) => req<RecipeDetail>('GET', `/recipes/${id}`),
    remove: (id: string) => req<void>('DELETE', `/recipes/${id}`),
    setFavorite: (id: string, isFavorite: boolean) =>
      req<void>('PATCH', `/recipes/${id}`, { isFavorite }),
    imageUrl: (id: string) => `/api/recipes/${id}/image`,
  },
  settings: {
    get: () => req<UserSettings>('GET', '/settings'),
    update: (patch: Partial<UserSettings>) => req<UserSettings>('PATCH', '/settings', patch),
  },
  foods: {
    search: (q: string, limit = 10) =>
      req<{ results: FoodSummary[] }>('GET', `/foods/search?q=${encodeURIComponent(q)}&limit=${limit}`),
    match: (text: string) => req<{ lines: FoodMatchLine[] }>('POST', '/foods/match', { text }),
    barcode: (ean: string) => req<FoodSummary>('GET', `/foods/barcode/${ean}`),
  },
  diary: {
    day: (date?: string) => req<DiaryDay>('GET', date ? `/diary?date=${date}` : '/diary'),
    log: (payload: { date?: string; daytime?: Daytime; origin?: string; lines: DiaryLogLine[] }) =>
      req<DiaryLogResult>('POST', '/diary/entries', payload),
    updateEntry: (id: string, patch: { amountG?: number; daytime?: Daytime; date?: string }) =>
      req<DiaryEntry>('PATCH', `/diary/entries/${id}`, patch),
    removeEntry: (id: string) => req<void>('DELETE', `/diary/entries/${id}`),
    addWater: (ml: number, date?: string) =>
      req<{ id: string; ml: number }>('POST', '/diary/water', { ml, date }),
    removeWater: (id: string) => req<void>('DELETE', `/diary/water/${id}`),
  },
  goals: {
    get: () => req<Goals>('GET', '/goals'),
    update: (patch: Partial<Goals>) => req<Goals>('PUT', '/goals', patch),
  },
}
