import { createDb, runMigrations } from './client.js'
import { env } from '../config/env.js'

const { db } = createDb(env.DATABASE_PATH)
runMigrations(db)
console.log(`Migrations applied to ${env.DATABASE_PATH}`)
