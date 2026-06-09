import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { getStreak, previousDay, updateStreakOnLog } from './streak.js'

describe('previousDay', () => {
  it('handles month and year boundaries', () => {
    expect(previousDay('2026-06-09')).toBe('2026-06-08')
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
    expect(previousDay('2026-01-01')).toBe('2025-12-31')
  })
})

describe('streak', () => {
  it('starts at 1, increments on consecutive days, ignores same-day logs', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'streaker', 'pw-123456')

    expect(updateStreakOnLog(db, user.id, '2026-06-01').currentStreak).toBe(1)
    expect(updateStreakOnLog(db, user.id, '2026-06-01').currentStreak).toBe(1)
    expect(updateStreakOnLog(db, user.id, '2026-06-02').currentStreak).toBe(2)
    expect(updateStreakOnLog(db, user.id, '2026-06-03').currentStreak).toBe(3)
    expect(getStreak(db, user.id)).toMatchObject({ currentStreak: 3, longestStreak: 3 })
  })

  it('resets after a gap but keeps the longest streak', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'gapper', 'pw-123456')
    updateStreakOnLog(db, user.id, '2026-06-01')
    updateStreakOnLog(db, user.id, '2026-06-02')
    const after = updateStreakOnLog(db, user.id, '2026-06-05')
    expect(after).toMatchObject({ currentStreak: 1, longestStreak: 2 })
  })

  it('ignores backdated entries', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'backdater', 'pw-123456')
    updateStreakOnLog(db, user.id, '2026-06-08')
    updateStreakOnLog(db, user.id, '2026-06-09')
    const s = updateStreakOnLog(db, user.id, '2026-06-01')
    expect(s).toMatchObject({ currentStreak: 2, lastLoggedDate: '2026-06-09' })
  })
})
