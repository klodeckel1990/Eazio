import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { env } from '../../config/env.js'
import { dateInTz } from '../meals/daytime.js'
import { previousDay } from './streak.js'
import { addWater, insertEntries } from './diary.repo.js'
import { getStats } from './stats.service.js'

function entry(userId: string, date: string, kcal: number, protein = 0) {
  const ts = Date.now()
  return {
    id: `${date}-${kcal}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    date,
    daytime: 'lunch',
    nameSnapshot: 'Test',
    amountG: 100,
    kcal,
    protein,
    origin: 'manual',
    createdAt: ts,
    updatedAt: ts,
  }
}

describe('stats', () => {
  it('returns zero-filled days, totals and logged-day averages', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'stats1', 'pw-123456')
    const today = dateInTz(new Date(), env.TZ)
    const yesterday = previousDay(today)
    const before = previousDay(yesterday)

    insertEntries(db, [
      entry(user.id, today, 500, 30),
      entry(user.id, today, 300, 10),
      entry(user.id, before, 1000, 50),
    ])
    addWater(db, user.id, today, 750, 'w1')

    const stats = getStats(db, user.id, 7)
    expect(stats.days).toHaveLength(7)
    expect(stats.days[6]).toMatchObject({ date: today, kcal: 800, protein: 40, waterMl: 750, entryCount: 2 })
    expect(stats.days[5]).toMatchObject({ date: yesterday, kcal: 0, entryCount: 0 })
    expect(stats.days[4]).toMatchObject({ date: before, kcal: 1000 })
    // averages over the 2 logged days only: (800 + 1000) / 2
    expect(stats.avg.kcal).toBe(900)
    expect(stats.daysLogged).toBe(2)
    expect(stats.goals.kcalTarget).toBe(2000)
  })

  it('handles an empty diary', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'stats2', 'pw-123456')
    const stats = getStats(db, user.id, 7)
    expect(stats.days).toHaveLength(7)
    expect(stats.avg.kcal).toBe(0)
    expect(stats.daysLogged).toBe(0)
  })

  it('does not leak other users data', async () => {
    const db = createTestDb()
    const alice = await createUser(db, 'stats3a', 'pw-123456')
    const bob = await createUser(db, 'stats3b', 'pw-123456')
    const today = dateInTz(new Date(), env.TZ)
    insertEntries(db, [entry(alice.id, today, 700)])
    expect(getStats(db, bob.id, 7).daysLogged).toBe(0)
  })
})
