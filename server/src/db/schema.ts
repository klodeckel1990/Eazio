import { sqliteTable, text, integer, real, unique, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  // Nullable: pre-existing bootstrap users have no email. Stored lowercased.
  email: text('email').unique(),
  passwordHash: text('password_hash').notNull(),
  settings: text('settings'), // JSON-encoded per-user UI settings
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
  (t) => [unique().on(t.userId, t.normalizedName)],
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
  (t) => [unique().on(t.userId, t.name)],
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
  // sha256 hex of the bearer token; null for cookie-only sessions. The raw
  // token is never stored — a DB leak must not leak usable credentials.
  tokenHash: text('token_hash').unique(),
  kind: text('kind').notNull().default('cookie'), // cookie|bearer
  deviceName: text('device_name'),
  platform: text('platform'), // web|ios|android
  createdAt: integer('created_at').notNull().default(0),
  lastUsedAt: integer('last_used_at'),
  expiresAt: integer('expires_at').notNull(),
})

// Unified food storage: BLS 4.0 import ('bls'), Open Food Facts barcode cache
// ('off') and user-created entries ('custom'). Summable day-view nutrients are
// columns (per 100 g/ml); the long tail lives in nutrientsJson keyed by
// EuroFIR component codes (VITC, CA, …). The companion FTS5 table foods_fts
// (raw SQL, migration 0007) indexes name/searchTerms/brand via triggers.
export const foods = sqliteTable(
  'foods',
  {
    id: text('id').primaryKey(), // 'bls:<SBLS>' | uuid
    source: text('source').notNull(), // bls|off|custom
    sourceId: text('source_id'), // BLS code | OFF barcode
    ownerUserId: text('owner_user_id').references(() => users.id), // custom only
    barcode: text('barcode'), // EAN-8/13
    name: text('name').notNull(),
    brand: text('brand'),
    category: text('category'), // BLS group letter / OFF category slug
    searchTerms: text('search_terms'), // normalized variants feeding the FTS index
    baseUnit: text('base_unit').notNull().default('g'), // g|ml
    kcal: real('kcal').notNull(),
    protein: real('protein'),
    fat: real('fat'),
    saturatedFat: real('saturated_fat'),
    carbs: real('carbs'),
    sugar: real('sugar'),
    fiber: real('fiber'),
    salt: real('salt'),
    sodium: real('sodium'), // mg/100g (salt is g/100g)
    alcohol: real('alcohol'),
    nutrientsJson: text('nutrients_json'),
    servingsJson: text('servings_json'), // [{label, grams}]
    version: integer('version').notNull().default(1),
    deletedAt: integer('deleted_at'), // soft delete for custom foods
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [unique().on(t.source, t.sourceId)],
)

// The diary is the app's source of truth (Yazio is at most a mirror target).
// Nutrient values are denormalized snapshots for the logged amount — history
// stays stable even when the referenced food is refreshed or edited later.
export const diaryEntries = sqliteTable(
  'diary_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    date: text('date').notNull(), // YYYY-MM-DD (Europe/Berlin)
    daytime: text('daytime').notNull(), // breakfast|lunch|dinner|snack
    foodId: text('food_id').references(() => foods.id), // null for free-form entries
    nameSnapshot: text('name_snapshot').notNull(),
    amountG: real('amount_g').notNull(),
    servingLabel: text('serving_label'),
    servingQuantity: real('serving_quantity'),
    kcal: real('kcal').notNull(), // snapshot for amountG, not per 100 g
    protein: real('protein'),
    fat: real('fat'),
    carbs: real('carbs'),
    sugar: real('sugar'),
    fiber: real('fiber'),
    origin: text('origin').notNull(), // manual|recipe|preset|photo|yazio_import
    originRefId: text('origin_ref_id'),
    mirrorStatus: text('mirror_status'), // null|pending|mirrored|skipped|failed
    mirrorJson: text('mirror_json'), // {accountId, productId, consumedId, error?}
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('diary_user_date_idx').on(t.userId, t.date)],
)

export const waterEntries = sqliteTable(
  'water_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    date: text('date').notNull(),
    ml: integer('ml').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('water_user_date_idx').on(t.userId, t.date)],
)

export const userGoals = sqliteTable('user_goals', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  kcalTarget: integer('kcal_target').notNull().default(2000),
  proteinG: real('protein_g'),
  fatG: real('fat_g'),
  carbsG: real('carbs_g'),
  waterMl: integer('water_ml').notNull().default(2000),
  weightKg: real('weight_kg'),
  weightGoalKg: real('weight_goal_kg'),
  // onboarding profile — feeds the kcal/macro plan computation
  gender: text('gender'), // female|male|diverse
  birthYear: integer('birth_year'),
  heightCm: real('height_cm'),
  activityLevel: text('activity_level'), // sedentary|light|moderate|active|very_active
  goalType: text('goal_type'), // lose|maintain|gain
  paceKgWeek: real('pace_kg_week'),
  onboardedAt: integer('onboarded_at'),
  updatedAt: integer('updated_at').notNull(),
})

// Maintained incrementally on every diary insert — the widget endpoint must
// never scan history to compute the streak.
export const userStats = sqliteTable('user_stats', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastLoggedDate: text('last_logged_date'),
  updatedAt: integer('updated_at').notNull(),
})

// Successor of `aliases` (which maps to Yazio product ids and keeps serving
// the legacy flow + mirror): learned ingredient name → own food.
export const foodAliases = sqliteTable(
  'food_aliases',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    normalizedName: text('normalized_name').notNull(),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    defaultAmountG: real('default_amount_g'),
    defaultServingLabel: text('default_serving_label'),
    hits: integer('hits').notNull().default(1),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [unique().on(t.userId, t.normalizedName)],
)

// Global (cross-user) LLM match memory: each unique ingredient name pays the
// AI-rerank latency at most once ever. Only shared foods (bls/off) are cached;
// custom foods stay per-user in food_aliases.
export const matchCache = sqliteTable('match_cache', {
  normalizedName: text('normalized_name').primaryKey(),
  foodId: text('food_id')
    .notNull()
    .references(() => foods.id),
  /** AI-estimated grams per piece for count entries ("Cocktailtomate" ≈ 15) */
  pieceGrams: real('piece_grams'),
  hits: integer('hits').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
})

export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  sourceUrl: text('source_url'),
  sourceType: text('source_type').notNull(), // link|text
  servings: integer('servings'),
  steps: text('steps'), // JSON-encoded string[] of preparation steps
  difficulty: text('difficulty'), // einfach|mittel|schwer
  totalMinutes: integer('total_minutes'),
  imageMime: text('image_mime'), // set when a cached image exists on the volume
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})

export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  raw: text('raw').notNull(),
  quantity: text('quantity').notNull(), // string ("", "2-3", "1/2"); scaled at track time
  unit: text('unit').notNull(),
  name: text('name').notNull(),
})
