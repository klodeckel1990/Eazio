import type { DB } from '../../db/client.js'
import { normalizeName } from '../matching/normalize.js'
import { upsertAlias } from '../learning/aliases.repo.js'
import { buildConsumedItem, type ConsumedItem, type LogItemInput } from './consumed-item.js'
import { createLogEvent, getLogEvent, markUndone } from './log-events.repo.js'
import type { Daytime } from '../meals/daytime.js'

export interface LogClient {
  user: {
    addConsumedItem: (item: ConsumedItem) => Promise<void>
    removeConsumedItem: (id: string) => Promise<void>
  }
}

export interface SubmitLine extends LogItemInput {
  name: string
}

export interface SubmitInput {
  date: string
  daytime: Daytime
  lines: SubmitLine[]
}

export interface SubmitResult {
  logId: string
  consumedIds: string[]
  count: number
}

export async function submitLog(
  client: LogClient,
  db: DB,
  userId: string,
  accountId: string,
  input: SubmitInput,
): Promise<SubmitResult> {
  const consumedIds: string[] = []
  for (const line of input.lines) {
    const item = buildConsumedItem(line, input.date, input.daytime)
    await client.user.addConsumedItem(item)
    consumedIds.push(item.id)
    upsertAlias(db, userId, normalizeName(line.name), {
      productId: line.productId,
      defaultServing: line.serving ?? null,
      defaultServingQuantity: line.servingQuantity ?? null,
      defaultAmountG: line.amountGrams,
    })
  }
  const logId = createLogEvent(db, {
    userId,
    yazioAccountId: accountId,
    date: input.date,
    daytime: input.daytime,
    status: 'logged',
    items: input.lines,
    consumedIds,
  })
  return { logId, consumedIds, count: consumedIds.length }
}

export async function undoLog(client: LogClient, db: DB, userId: string, logId: string): Promise<boolean> {
  const ev = getLogEvent(db, userId, logId)
  if (!ev || ev.status === 'undone') return false
  const ids = JSON.parse(ev.consumedIdsJson ?? '[]') as string[]
  for (const id of ids) {
    await client.user.removeConsumedItem(id)
  }
  markUndone(db, userId, logId)
  return true
}
