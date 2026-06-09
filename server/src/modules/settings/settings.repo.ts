import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { users } from '../../db/schema.js'

export interface UserSettings {
  /** Hide the iOS share-shortcut hint on the recipes page. */
  iosShortcutHintDismissed: boolean
}

const DEFAULTS: UserSettings = { iosShortcutHintDismissed: false }

export function getSettings(db: DB, userId: string): UserSettings {
  const row = db.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).get()
  return parseSettings(row?.settings ?? null)
}

export function updateSettings(db: DB, userId: string, patch: Partial<UserSettings>): UserSettings {
  const next: UserSettings = { ...getSettings(db, userId), ...patch }
  db.update(users).set({ settings: JSON.stringify(next) }).where(eq(users.id, userId)).run()
  return next
}

function parseSettings(raw: string | null): UserSettings {
  if (!raw) return { ...DEFAULTS }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    return { iosShortcutHintDismissed: o.iosShortcutHintDismissed === true }
  } catch {
    return { ...DEFAULTS }
  }
}
