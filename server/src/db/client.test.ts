import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from './test-db.js'

describe('db client + migrations', () => {
  it('creates all app tables in an in-memory db', () => {
    const db = createTestDb()
    // foods_fts is an FTS5 virtual table; its shadow tables (foods_fts_*) are
    // SQLite implementation details and excluded here.
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE 'foods_fts%'`,
    )
    const names = rows.map((r) => r.name).sort()
    expect(names).toEqual(
      [
        'activity_days',
        'aliases',
        'auth_identities',
        'diary_entries',
        'food_aliases',
        'foods',
        'log_events',
        'match_cache',
        'preset_items',
        'presets',
        'push_reminders',
        'push_tokens',
        'recipe_ingredients',
        'recipes',
        'sessions',
        'user_goals',
        'user_stats',
        'users',
        'water_entries',
        'yazio_accounts',
      ].sort(),
    )
  })

  it('creates the foods FTS index with sync triggers', () => {
    const db = createTestDb()
    const fts = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name = 'foods_fts'`,
    )
    expect(fts).toHaveLength(1)
    const triggers = db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'foods_fts_%'`)
      .map((r) => r.name)
      .sort()
    expect(triggers).toEqual(['foods_fts_ad', 'foods_fts_ai', 'foods_fts_au'])
  })

  it('applies the expected columns for key tables', () => {
    const db = createTestDb()
    const userCols = db
      .all<{ name: string }>(sql`PRAGMA table_info(users)`)
      .map((r) => r.name)
    expect(userCols).toContain('password_hash')
    const accountCols = db
      .all<{ name: string }>(sql`PRAGMA table_info(yazio_accounts)`)
      .map((r) => r.name)
    expect(accountCols).toContain('enc_credentials')
  })
})
