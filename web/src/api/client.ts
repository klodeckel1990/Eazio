import type {
  Account, AuthResponse, Candidate, LogLine, LogResult, MatchResponse, Preset, PresetWithItems, User, Daytime,
  ImportedRecipe, RecipeSummary, RecipeDetail, RecipeIngredient, UserSettings,
  DiaryDay, DiaryLogLine, DiaryLogResult, DiaryEntry, FoodMatchLine, FoodSummary, Goals,
  ImportHistoryResult, StatsResult, OnboardingInput, OnboardingPlan, DiaryMonth,
  CustomFoodInput, LabelScanResult, OAuthConfig, SocialProvider, BillingStatus, RecentFood,
} from './types'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// Same-origin ('' = relative /api) on the web; the Capacitor build bakes in an
// absolute URL via VITE_API_BASE.
// Exported: Links, die NACH AUSSEN gehen (z. B. die öffentliche Rezept-URL für
// Bring!), brauchen die Server-Origin — window.location.origin wäre in der
// nativen App capacitor://localhost und von außen unerreichbar.
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''
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

export function getToken(): string | null {
  return token
}

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
  // 'same-origin' keeps the legacy cookie fallback on the web, while requests
  // from the Capacitor shell (cross-origin) stay uncredentialed — credentialed
  // CORS would require Allow-Credentials on every response and WKWebView
  // silently rejects without it. Auth travels in the Authorization header.
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    credentials: 'same-origin',
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
    oauthConfig: () => req<OAuthConfig>('GET', '/auth/oauth/config'),
    oauthLogin: (
      provider: SocialProvider,
      idToken: string,
      name: string | undefined,
      platform: 'web' | 'ios' | 'android',
    ) => req<AuthResponse>('POST', `/auth/oauth/${provider}`, { idToken, name, platform }),
    logout: () => req<void>('POST', '/auth/logout'),
    deleteAccount: () => req<void>('DELETE', '/auth/me'),
  },
  billing: {
    status: () => req<BillingStatus>('GET', '/billing/status'),
  },
  accounts: {
    list: () => req<Account[]>('GET', '/accounts'),
    link: (label: string, username: string, password: string) =>
      req<Account>('POST', '/accounts', { label, username, password }),
    setDefault: (id: string) => req<void>('PATCH', `/accounts/${id}/default`),
    remove: (id: string) => req<void>('DELETE', `/accounts/${id}`),
    importHistory: (id: string, days = 90) =>
      req<ImportHistoryResult>('POST', `/accounts/${id}/import-history`, { days }),
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
    update: (id: string, patch: { name?: string; items?: Omit<PresetWithItems['items'][number], 'position'>[] }) =>
      req<PresetWithItems>('PUT', `/presets/${id}`, patch),
    remove: (id: string) => req<void>('DELETE', `/presets/${id}`),
  },
  recipes: {
    import: (input: { url?: string; text?: string; lang?: string }) =>
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
    // token-guarded public route: works in plain <img> tags (no Authorization
    // header possible), absolute so the native app hits the server
    imageUrl: (id: string, token: string) =>
      `${API_BASE}/r/${id}/image?t=${encodeURIComponent(token)}`,
  },
  settings: {
    get: () => req<UserSettings>('GET', '/settings'),
    update: (patch: Partial<UserSettings>) => req<UserSettings>('PATCH', '/settings', patch),
  },
  push: {
    register: (token: string, platform: 'ios' | 'android') =>
      req<void>('POST', '/push/register', { token, platform }),
    unregister: (token: string) => req<void>('POST', '/push/unregister', { token }),
  },
  foods: {
    search: (q: string, limit = 10) =>
      req<{ results: FoodSummary[] }>('GET', `/foods/search?q=${encodeURIComponent(q)}&limit=${limit}`),
    match: (text: string) => req<{ lines: FoodMatchLine[] }>('POST', '/foods/match', { text }),
    photoMeal: (image: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp') =>
      req<{ lines: FoodMatchLine[]; mealGuess: Daytime | null }>('POST', '/foods/photo-meal', { image, mediaType }),
    barcode: (ean: string) => req<FoodSummary>('GET', `/foods/barcode/${ean}`),
    create: (body: CustomFoodInput) => req<FoodSummary>('POST', '/foods', body),
    labelScan: (image: string, mediaType: string) =>
      req<LabelScanResult>('POST', '/foods/label-scan', { image, mediaType }),
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
    month: (month: string) => req<DiaryMonth>('GET', `/diary/month?month=${month}`),
    recentFoods: (limit = 30) => req<{ foods: RecentFood[] }>('GET', `/diary/recent-foods?limit=${limit}`),
  },
  goals: {
    get: () => req<Goals>('GET', '/goals'),
    update: (patch: Partial<Goals>) => req<Goals>('PUT', '/goals', patch),
    onboarding: (input: OnboardingInput) =>
      req<{ goals: Goals; plan: OnboardingPlan }>('POST', '/goals/onboarding', input),
    skipOnboarding: () => req<Goals>('POST', '/goals/onboarding/skip'),
  },
  stats: {
    get: (days: number) => req<StatsResult>('GET', `/stats?days=${days}`),
  },
  activity: {
    update: (patch: { date?: string; steps?: number; activeKcal?: number; weightKg?: number }) =>
      req<{ activity: { steps: number | null; activeKcal: number | null; weightKg: number | null } }>('PUT', '/activity/day', patch),
  },
}
