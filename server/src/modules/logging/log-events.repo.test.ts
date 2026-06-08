import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount } from '../accounts/accounts.repo.js'
import { createLogEvent, getLogEvent, markUndone } from './log-events.repo.js'

async function seed(db: ReturnType<typeof createTestDb>) {
  const user = await createUser(db, 'jens', 'pw-123456')
  const acc = createAccount(db, user.id, 'Me', { username: 'me@x.de', password: 'secret' })
  return { userId: user.id, accountId: acc.id }
}

describe('log-events repo', () => {
  it('creates, reads (user-scoped), and marks undone', async () => {
    const db = createTestDb()
    const { userId, accountId } = await seed(db)

    const id = createLogEvent(db, {
      userId, yazioAccountId: accountId, date: '2026-06-08', daytime: 'breakfast',
      status: 'logged', items: [{ productId: 'p1', amountGrams: 80, name: 'Haferflocken' }],
      consumedIds: ['c1', 'c2'],
    })
    expect(id).toMatch(/[0-9a-f-]{36}/)

    const ev = getLogEvent(db, userId, id)!
    expect(ev.status).toBe('logged')
    expect(JSON.parse(ev.consumedIdsJson!)).toEqual(['c1', 'c2'])

    expect(getLogEvent(db, 'someone-else', id)).toBeUndefined()

    expect(markUndone(db, userId, id)).toBe(true)
    expect(getLogEvent(db, userId, id)!.status).toBe('undone')
    expect(markUndone(db, 'someone-else', id)).toBe(false)
  })
})
