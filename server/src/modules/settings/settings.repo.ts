import { eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { users } from '../../db/schema.js'

export type ShoppingListFormat = 'plain' | 'checklist' | 'bring'
const SHOPPING_FORMATS: ShoppingListFormat[] = ['plain', 'checklist', 'bring']

export interface UserSettings {
  /** Hide the iOS share-shortcut hint on the recipes page. */
  iosShortcutHintDismissed: boolean
  /** Preferred format when copying a recipe's ingredients as a shopping list. */
  shoppingListFormat: ShoppingListFormat
  /** The first-login onboarding wizard has been completed or skipped. */
  onboardingDone: boolean
  /** Mirror diary entries to the linked default Yazio account (transition aid).
   *  Defaults to true so existing Yazio users keep their data flowing. */
  mirrorToYazio: boolean
  /** Add Apple-Health active calories on top of the daily kcal budget. */
  activityBudget: boolean
}

const DEFAULTS: UserSettings = {
  iosShortcutHintDismissed: false,
  shoppingListFormat: 'plain',
  onboardingDone: false,
  mirrorToYazio: true,
  activityBudget: false,
}

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
    const fmt = o.shoppingListFormat
    return {
      iosShortcutHintDismissed: o.iosShortcutHintDismissed === true,
      shoppingListFormat: SHOPPING_FORMATS.includes(fmt as ShoppingListFormat)
        ? (fmt as ShoppingListFormat)
        : 'plain',
      onboardingDone: o.onboardingDone === true,
      mirrorToYazio: o.mirrorToYazio !== false,
      activityBudget: o.activityBudget === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}
