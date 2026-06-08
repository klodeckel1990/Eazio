import { createDb, runMigrations, type DB } from './client.js'

/** Fresh in-memory database with all migrations applied. */
export function createTestDb(): DB {
  const { db } = createDb(':memory:')
  runMigrations(db)
  return db
}
