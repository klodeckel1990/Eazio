import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import {
  users,
  authIdentities,
  yazioAccounts,
  aliases,
  presets,
  logEvents,
  sessions,
  foods,
  diaryEntries,
  waterEntries,
  userGoals,
  userStats,
  foodAliases,
  pushTokens,
  pushReminders,
  pushLog,
  activityDays,
  recipes,
} from '../../db/schema.js'

/**
 * Hard-deletes a user and every row that belongs to them — the DSGVO / App
 * Store "delete account" obligation. Runs in one transaction; ordered children
 * → parents because `foreign_keys = ON`. `preset_items` and `recipe_ingredients`
 * are removed automatically via their ON DELETE CASCADE on the parent row.
 *
 * Global tables are intentionally untouched: shared `foods` (bls/off) and
 * `match_cache` are cross-user and carry no personal data — only the user's
 * own custom foods (ownerUserId) are dropped.
 */
export function deleteUserAccount(db: DB, userId: string): boolean {
  return db.transaction((tx) => {
    const t = tx as unknown as DB
    if (!t.select().from(users).where(eq(users.id, userId)).get()) return false

    // refs both users and yazio_accounts → before yazio_accounts
    t.delete(logEvents).where(eq(logEvents.userId, userId)).run()
    t.delete(yazioAccounts).where(eq(yazioAccounts.userId, userId)).run()

    // parents whose children cascade
    t.delete(recipes).where(eq(recipes.userId, userId)).run() // → recipe_ingredients
    t.delete(presets).where(eq(presets.userId, userId)).run() // → preset_items

    // rows that reference foods → before custom foods are removed
    t.delete(diaryEntries).where(eq(diaryEntries.userId, userId)).run()
    t.delete(foodAliases).where(eq(foodAliases.userId, userId)).run()

    t.delete(aliases).where(eq(aliases.userId, userId)).run()
    t.delete(waterEntries).where(eq(waterEntries.userId, userId)).run()
    t.delete(activityDays).where(eq(activityDays.userId, userId)).run()
    t.delete(pushLog).where(eq(pushLog.userId, userId)).run()
    t.delete(pushReminders).where(eq(pushReminders.userId, userId)).run()
    t.delete(pushTokens).where(eq(pushTokens.userId, userId)).run()
    t.delete(userGoals).where(eq(userGoals.userId, userId)).run()
    t.delete(userStats).where(eq(userStats.userId, userId)).run()

    // the user's own custom foods (shared bls/off rows stay)
    t.delete(foods).where(eq(foods.ownerUserId, userId)).run()

    t.delete(authIdentities).where(eq(authIdentities.userId, userId)).run()
    t.delete(sessions).where(eq(sessions.userId, userId)).run() // logs out every device
    t.delete(users).where(eq(users.id, userId)).run()
    return true
  })
}
