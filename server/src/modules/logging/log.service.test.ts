import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount } from '../accounts/accounts.repo.js'
import { getAlias } from '../learning/aliases.repo.js'
import { submitLog, undoLog, type LogClient } from './log.service.js'

function fakeClient() {
  return {
    user: { addConsumedItem: vi.fn().mockResolvedValue(undefined), removeConsumedItem: vi.fn().mockResolvedValue(undefined) },
  }
}

async function seed(db: ReturnType<typeof createTestDb>) {
  const user = await createUser(db, 'jens', 'pw-123456')
  const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret' })
  return { userId: user.id, accountId: acc.id }
}

describe('log service', () => {
  it('logs each line, learns aliases, records the event', async () => {
    const db = createTestDb()
    const { userId, accountId } = await seed(db)
    const client = fakeClient()

    const res = await submitLog(client as unknown as LogClient, db, userId, accountId, {
      date: '2026-06-08', daytime: 'breakfast',
      lines: [
        { productId: 'p1', name: 'Haferflocken', amountGrams: 80 },
        { productId: 'p2', name: 'Milch', amountGrams: 200 },
      ],
    })

    expect(res.count).toBe(2)
    expect(client.user.addConsumedItem).toHaveBeenCalledTimes(2)
    expect(res.consumedIds).toHaveLength(2)
    expect(getAlias(db, userId, 'haferflocken')?.productId).toBe('p1')
    expect(getAlias(db, userId, 'milch')?.productId).toBe('p2')
  })

  it('undo removes each consumed item and marks the event undone', async () => {
    const db = createTestDb()
    const { userId, accountId } = await seed(db)
    const client = fakeClient()

    const res = await submitLog(client as unknown as LogClient, db, userId, accountId, {
      date: '2026-06-08', daytime: 'lunch',
      lines: [{ productId: 'p1', name: 'Reis', amountGrams: 150 }],
    })

    expect(await undoLog(client as unknown as LogClient, db, userId, res.logId)).toBe(true)
    expect(client.user.removeConsumedItem).toHaveBeenCalledTimes(1)
    expect(client.user.removeConsumedItem).toHaveBeenCalledWith(res.consumedIds[0])
    expect(await undoLog(client as unknown as LogClient, db, userId, res.logId)).toBe(false)
  })
})
