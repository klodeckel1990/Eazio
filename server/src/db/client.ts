import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.js'

export type DB = BetterSQLite3Database<typeof schema>

const here = path.dirname(fileURLToPath(import.meta.url))
// src/db/* (tsx) and dist/db/* (build) both sit two levels under server/ -> server/drizzle
export const MIGRATIONS_DIR = path.resolve(here, '../../drizzle')

export function createDb(dbPath: string): { db: DB; sqlite: Database.Database } {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

export function runMigrations(db: DB): void {
  // migrate() reads the underlying connection from the Drizzle wrapper's
  // session; `db` must be a BetterSQLite3Database created via createDb().
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}

/** Creates the parent directory for a file-based SQLite path (no-op for :memory:). */
export function ensureDbDir(dbPath: string): void {
  if (dbPath === ':memory:') return
  mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true })
}
