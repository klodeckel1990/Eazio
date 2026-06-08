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
