import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { insertEntries } from './diary.repo.js'
import { getStreak, previousDay, recomputeStreak } from './streak.js'
import type { DB } from '../../db/client.js'

describe('previousDay', () => {
  it('handles month and year boundaries', () => {
    expect(previousDay('2026-06-09')).toBe('2026-06-08')
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
    expect(previousDay('2026-01-01')).toBe('2025-12-31')
  })
})

function logDay(db: DB, userId: string, date: string): void {
  const ts = Date.now()
  insertEntries(db, [{
    id: randomUUID(),
    userId,
    date,
    daytime: 'lunch',
    foodId: null,
    nameSnapshot: 'Testessen',
    amountG: 100,
    servingLabel: null,
    servingQuantity: null,
    kcal: 100,
    protein: 1,
    fat: 1,
    carbs: 1,
    sugar: 0,
    fiber: 0,
    origin: 'manual',
    originRefId: null,
    mirrorStatus: 'skipped',
    mirrorJson: null,
    createdAt: ts,
    updatedAt: ts,
  }])
}

describe('streak (recompute from diary dates)', () => {
  it('counts consecutive days, ignores same-day duplicates', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'streaker', 'pw-123456')
    logDay(db, user.id, '2026-06-01')
    expect(recomputeStreak(db, user.id).currentStreak).toBe(1)
    logDay(db, user.id, '2026-06-01')
    expect(recomputeStreak(db, user.id).currentStreak).toBe(1)
    logDay(db, user.id, '2026-06-02')
    logDay(db, user.id, '2026-06-03')
    expect(recomputeStreak(db, user.id)).toMatchObject({
      currentStreak: 3, longestStreak: 3, lastLoggedDate: '2026-06-03',
    })
    expect(getStreak(db, user.id).currentStreak).toBe(3)
  })

  it('resets after a gap but keeps the longest streak', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'gapper', 'pw-123456')
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-05']) logDay(db, user.id, d)
    expect(recomputeStreak(db, user.id)).toMatchObject({ currentStreak: 1, longestStreak: 2 })
  })

  it('backdated entries can close a gap and join two runs', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'backfiller', 'pw-123456')
    for (const d of ['2026-06-08', '2026-06-10']) logDay(db, user.id, d)
    expect(recomputeStreak(db, user.id).currentStreak).toBe(1)
    logDay(db, user.id, '2026-06-09') // Lücke nachgetragen
    expect(recomputeStreak(db, user.id)).toMatchObject({
      currentStreak: 3, lastLoggedDate: '2026-06-10',
    })
  })

  it('counts imported days (no manual log path involved)', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'importer', 'pw-123456')
    // simuliert den Yazio-Import: direkte insertEntries über mehrere Tage
    for (const d of ['2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10']) logDay(db, user.id, d)
    expect(recomputeStreak(db, user.id)).toMatchObject({ currentStreak: 4, longestStreak: 4 })
  })

  it('deleting the only entry of a day shortens the streak on recompute', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'deleter', 'pw-123456')
    for (const d of ['2026-06-09', '2026-06-10']) logDay(db, user.id, d)
    expect(recomputeStreak(db, user.id).currentStreak).toBe(2)
    // longestStreak bleibt als Bestwert erhalten, current schrumpft
    db.$client.prepare("DELETE FROM diary_entries WHERE date = '2026-06-09'").run()
    expect(recomputeStreak(db, user.id)).toMatchObject({ currentStreak: 1, longestStreak: 2 })
  })
})
