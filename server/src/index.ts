import { env } from './config/env.js'
import { createDb, runMigrations, ensureDbDir } from './db/client.js'
import { buildApp } from './app.js'
import { startReminderJob } from './modules/push/reminder-job.js'

async function main(): Promise<void> {
  ensureDbDir(env.DATABASE_PATH)
  const { db, sqlite } = createDb(env.DATABASE_PATH)
  runMigrations(db)

  const app = buildApp(db)
  startReminderJob(db, app.log)

  const shutdown = async (): Promise<void> => {
    await app.close()
    sqlite.close()
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
