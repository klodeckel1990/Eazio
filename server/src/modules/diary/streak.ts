import { desc, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { diaryEntries, userStats } from '../../db/schema.js'

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
 * Recomputes the streak from the actual diary dates and caches it in
 * user_stats. Unlike the old per-log increment this also counts days created
 * by imports (Yazio history/mirror) and survives deletes and backfilled gaps.
 * Bounded scan: the last 730 distinct days; longer historic runs survive via
 * max() against the stored longestStreak.
 */
export function recomputeStreak(db: DB, userId: string): Streak {
  const dates = db
    .selectDistinct({ date: diaryEntries.date })
    .from(diaryEntries)
    .where(eq(diaryEntries.userId, userId))
    .orderBy(desc(diaryEntries.date))
    .limit(730)
    .all()
    .map((r) => r.date)

  let current = dates.length > 0 ? 1 : 0
  for (let i = 1; i < dates.length && dates[i] === previousDay(dates[i - 1]!); i++) current++

  let longest = 0
  let run = 0
  for (let i = 0; i < dates.length; i++) {
    run = i > 0 && dates[i] === previousDay(dates[i - 1]!) ? run + 1 : 1
    if (run > longest) longest = run
  }

  const prev = getStreak(db, userId)
  const next: Streak = {
    currentStreak: current,
    longestStreak: Math.max(longest, prev.longestStreak),
    lastLoggedDate: dates[0] ?? null,
  }
  db.insert(userStats)
    .values({ userId, ...next, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: userStats.userId, set: { ...next, updatedAt: Date.now() } })
    .run()
  return next
}
