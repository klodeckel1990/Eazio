import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { userStats } from '../../db/schema.js'

export interface Streak {
  currentStreak: number
  longestStreak: number
  lastLoggedDate: string | null
}

/** Day before a YYYY-MM-DD date string (pure calendar math, UTC-safe). */
export function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function getStreak(db: DB, userId: string): Streak {
  const row = db.select().from(userStats).where(eq(userStats.userId, userId)).get()
  return row
    ? { currentStreak: row.currentStreak, longestStreak: row.longestStreak, lastLoggedDate: row.lastLoggedDate }
    : { currentStreak: 0, longestStreak: 0, lastLoggedDate: null }
}

/**
 * Incremental streak update on a diary insert for `date` — never scans
 * history. Same day: no-op; consecutive day: +1; gap: reset to 1. Backdated
 * entries (date < lastLoggedDate) leave the streak untouched.
 */
export function updateStreakOnLog(db: DB, userId: string, date: string): Streak {
  const s = getStreak(db, userId)
  if (s.lastLoggedDate === date) return s
  if (s.lastLoggedDate && date < s.lastLoggedDate) return s

  const currentStreak = s.lastLoggedDate === previousDay(date) ? s.currentStreak + 1 : 1
  const next: Streak = {
    currentStreak,
    longestStreak: Math.max(currentStreak, s.longestStreak),
    lastLoggedDate: date,
  }
  db.insert(userStats)
    .values({ userId, ...next, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: userStats.userId, set: { ...next, updatedAt: Date.now() } })
    .run()
  return next
}
