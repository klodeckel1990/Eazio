import { createDb, runMigrations, ensureDbDir } from './client.js'
import { env } from '../config/env.js'

ensureDbDir(env.DATABASE_PATH)
const { db, sqlite } = createDb(env.DATABASE_PATH)
runMigrations(db)
sqlite.close()
console.log(`Migrations applied to ${env.DATABASE_PATH}`)
