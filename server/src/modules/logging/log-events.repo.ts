import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { logEvents } from '../../db/schema.js'
import type { Daytime } from '../meals/daytime.js'

export type LogEventRecord = typeof logEvents.$inferSelect

export interface CreateLogEventInput {
  userId: string
  yazioAccountId: string
  date: string
  daytime: Daytime
  status: 'logged' | 'error'
  items: unknown
  consumedIds: string[]
}

export function createLogEvent(db: DB, input: CreateLogEventInput): string {
  const id = randomUUID()
  db.insert(logEvents)
    .values({
      id,
      userId: input.userId,
      yazioAccountId: input.yazioAccountId,
      date: input.date,
      daytime: input.daytime,
      status: input.status,
      itemsJson: JSON.stringify(input.items),
      consumedIdsJson: JSON.stringify(input.consumedIds),
      createdAt: Date.now(),
    })
    .run()
  return id
}

export function getLogEvent(db: DB, userId: string, id: string): LogEventRecord | undefined {
  return db
    .select()
    .from(logEvents)
    .where(and(eq(logEvents.id, id), eq(logEvents.userId, userId)))
    .get()
}

export function markUndone(db: DB, userId: string, id: string): boolean {
  if (!getLogEvent(db, userId, id)) return false
  db.update(logEvents)
    .set({ status: 'undone' })
    .where(and(eq(logEvents.id, id), eq(logEvents.userId, userId)))
    .run()
  return true
}
