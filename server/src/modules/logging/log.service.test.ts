import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount } from '../accounts/accounts.repo.js'
import { getAlias } from '../learning/aliases.repo.js'
import { logEvents } from '../../db/schema.js'
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

  it('records a partial error event when a line fails mid-submit', async () => {
    const db = createTestDb()
    const { userId, accountId } = await seed(db)
    const add = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('yazio down'))
    const client = { user: { addConsumedItem: add, removeConsumedItem: vi.fn() } }

    await expect(
      submitLog(client as unknown as LogClient, db, userId, accountId, {
        date: '2026-06-08', daytime: 'dinner',
        lines: [
          { productId: 'p1', name: 'A', amountGrams: 50 },
          { productId: 'p2', name: 'B', amountGrams: 60 },
        ],
      }),
    ).rejects.toThrow('yazio down')

    const events = db.select().from(logEvents).all()
    expect(events).toHaveLength(1)
    expect(events[0]!.status).toBe('error')
    expect(JSON.parse(events[0]!.consumedIdsJson!)).toHaveLength(1)
    // first line learned, second never reached
    expect(getAlias(db, userId, 'a')?.productId).toBe('p1')
    expect(getAlias(db, userId, 'b')).toBeUndefined()
  })

  it('undo returns false for an unknown event', async () => {
    const db = createTestDb()
    const { userId } = await seed(db)
    expect(await undoLog(fakeClient() as unknown as LogClient, db, userId, 'nope')).toBe(false)
  })
})
