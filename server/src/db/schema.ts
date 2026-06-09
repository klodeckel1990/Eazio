import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
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
  expiresAt: integer('expires_at').notNull(),
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
