import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { env } from './config/env.js'
import { createDb, runMigrations } from './db/client.js'
import { buildApp } from './app.js'

function ensureDbDir(dbPath: string): void {
  if (dbPath === ':memory:') return
  mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true })
}

async function main(): Promise<void> {
  ensureDbDir(env.DATABASE_PATH)
  const { db } = createDb(env.DATABASE_PATH)
  runMigrations(db)

  const app = buildApp(db)

  const shutdown = async (): Promise<void> => {
    await app.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown())
  process.on('SIGINT', () => void shutdown())

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
