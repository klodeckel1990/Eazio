export interface User { id: string; username: string }
// Login/register response: user plus the bearer token (returned exactly once).
export interface AuthResponse extends User { token: string }
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

export interface RecipeIngredient { raw: string; quantity: string; unit: string; name: string }
export interface ImportedRecipe {
  title: string | null
  servings: number | null
  sourceUrl: string | null
  source: 'link' | 'text'
  imageUrl: string | null
  difficulty: string | null
  totalMinutes: number | null
  ingredients: RecipeIngredient[]
  steps: string[]
}
export interface RecipeSummary {
  id: string
  title: string
  servings: number | null
  difficulty: string | null
  totalMinutes: number | null
  isFavorite: boolean
  hasImage: boolean
  /** HMAC token for the public image route (null without image) */
  imageToken: string | null
}
export interface RecipeDetail extends RecipeSummary {
  sourceUrl: string | null
  sourceType: string
  ingredients: RecipeIngredient[]
  steps: string[]
  shareToken: string
}

export type ShoppingListFormat = 'plain' | 'checklist' | 'bring'
export interface UserSettings {
  shoppingListFormat: ShoppingListFormat
  onboardingDone: boolean
  mirrorToYazio: boolean
  activityBudget: boolean
}

// --- own food database & diary (Phase 3) -----------------------------------

export interface ServingDef { label: string; grams: number }

export interface FoodSummary {
  id: string
  source: 'bls' | 'off' | 'custom'
  name: string
  brand: string | null
  category: string | null
  barcode: string | null
  baseUnit: string
  kcal: number
  protein: number | null
  fat: number | null
  saturatedFat: number | null
  carbs: number | null
  sugar: number | null
  fiber: number | null
  salt: number | null
  servings: ServingDef[]
  isOwn: boolean
}

export interface FoodMatchLine {
  raw: string
  name: string
  qty: number | null
  unit: 'g' | 'ml' | 'serving'
  amountGrams: number | null
  suggestedAmountG: number
  candidates: FoodSummary[]
  selectedFoodId: string | null
}

/** Eingabe für POST /api/foods — Nährwerte pro 100 g/ml. */
export interface CustomFoodInput {
  name: string
  brand?: string | null
  barcode?: string | null
  baseUnit?: 'g' | 'ml'
  kcal: number
  protein?: number | null
  fat?: number | null
  saturatedFat?: number | null
  carbs?: number | null
  sugar?: number | null
  fiber?: number | null
  salt?: number | null
  servings?: ServingDef[]
}

/** Ergebnis des Nährwerttabellen-Fotoscans (alle Felder best-effort). */
export interface LabelScanResult {
  name: string | null
  brand: string | null
  kcal: number | null
  protein: number | null
  fat: number | null
  saturatedFat: number | null
  carbs: number | null
  sugar: number | null
  fiber: number | null
  salt: number | null
  servingG: number | null
}

export interface DiaryEntry {
  id: string
  date: string
  daytime: Daytime
  foodId: string | null
  nameSnapshot: string
  amountG: number
  kcal: number
  protein: number | null
  fat: number | null
  carbs: number | null
  sugar: number | null
  fiber: number | null
  origin: string
  mirrorStatus: 'pending' | 'mirrored' | 'skipped' | 'failed' | null
  createdAt: number
}

export interface Streak {
  currentStreak: number
  longestStreak: number
  lastLoggedDate: string | null
}

export type Gender = 'female' | 'male' | 'diverse'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type GoalType = 'lose' | 'maintain' | 'gain'

export interface Goals {
  kcalTarget: number
  proteinG: number | null
  fatG: number | null
  carbsG: number | null
  waterMl: number
  weightKg: number | null
  weightGoalKg: number | null
  gender: Gender | null
  birthYear: number | null
  heightCm: number | null
  activityLevel: ActivityLevel | null
  goalType: GoalType | null
  paceKgWeek: number | null
  onboardedAt: number | null
}

export interface OnboardingInput {
  gender: Gender
  birthYear: number
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goalType: GoalType
  weightGoalKg?: number | null
  paceKgWeek?: number | null
}

export interface OnboardingPlan {
  bmr: number
  tdee: number
  kcalTarget: number
  proteinG: number
  fatG: number
  carbsG: number
  waterMl: number
  etaWeeks: number | null
}

export interface DayActivity {
  steps: number | null
  activeKcal: number | null
  weightKg: number | null
  countedKcal: number
}

export interface DiaryDay {
  date: string
  defaultDaytime: Daytime
  entries: DiaryEntry[]
  totals: { kcal: number; protein: number; fat: number; carbs: number; sugar: number; fiber: number }
  goals: Goals
  remainingKcal: number
  water: { totalMl: number; entries: { id: string; ml: number }[] }
  streak: Streak
  activity: DayActivity | null
}

export interface DiaryMonth {
  month: string
  kcalTarget: number
  days: { date: string; kcal: number }[]
}

export interface DiaryLogLine {
  foodId: string
  amountG: number
  rawText?: string
}

export interface DiaryLogResult {
  date: string
  daytime: Daytime
  entries: DiaryEntry[]
  streak: Streak
  mirrorQueued: boolean
}

export interface StatsDay {
  date: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  waterMl: number
  entryCount: number
  steps: number | null
  activeKcal: number | null
  weightKg: number | null
}

export interface StatsResult {
  days: StatsDay[]
  goals: Goals
  streak: Streak
  avg: { kcal: number; protein: number; fat: number; carbs: number; waterMl: number; steps: number | null; activeKcal: number | null }
  daysLogged: number
}

export interface ImportHistoryResult {
  daysScanned: number
  daysSkipped: number
  entriesImported: number
}
