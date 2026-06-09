import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core'

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
