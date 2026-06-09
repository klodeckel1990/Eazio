import type {
  Account, Candidate, LogLine, LogResult, MatchResponse, Preset, PresetWithItems, User, Daytime,
  ImportedRecipe, RecipeSummary, RecipeDetail, RecipeIngredient, UserSettings,
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
}
