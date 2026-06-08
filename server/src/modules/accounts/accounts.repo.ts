import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { yazioAccounts } from '../../db/schema.js'
import { encrypt, decrypt } from '../../crypto/aes.js'

export interface StoredCredentials {
  username: string
  password: string
}

export interface AccountSummary {
  id: string
  label: string
  yazioUsername: string
  isDefault: boolean
}

export type AccountRecord = typeof yazioAccounts.$inferSelect

export function createAccount(
  db: DB,
  userId: string,
  label: string,
  creds: StoredCredentials,
): AccountSummary {
  const id = randomUUID()
  const existing = db
    .select({ id: yazioAccounts.id })
    .from(yazioAccounts)
    .where(eq(yazioAccounts.userId, userId))
    .all()
  const isDefault = existing.length === 0
  db.insert(yazioAccounts)
    .values({
      id,
      userId,
      label,
      yazioUsername: creds.username,
      encCredentials: encrypt(JSON.stringify(creds)),
      encTokens: null,
      isDefault,
      updatedAt: Date.now(),
    })
    .run()
  return { id, label, yazioUsername: creds.username, isDefault }
}

export function listAccounts(db: DB, userId: string): AccountSummary[] {
  return db
    .select({
      id: yazioAccounts.id,
      label: yazioAccounts.label,
      yazioUsername: yazioAccounts.yazioUsername,
      isDefault: yazioAccounts.isDefault,
    })
    .from(yazioAccounts)
    .where(eq(yazioAccounts.userId, userId))
    .all()
}

export function getAccount(db: DB, userId: string, id: string): AccountRecord | undefined {
  return db
    .select()
    .from(yazioAccounts)
    .where(and(eq(yazioAccounts.id, id), eq(yazioAccounts.userId, userId)))
    .get()
}

export function getDefaultAccount(db: DB, userId: string): AccountRecord | undefined {
  return db
    .select()
    .from(yazioAccounts)
    .where(and(eq(yazioAccounts.userId, userId), eq(yazioAccounts.isDefault, true)))
    .get()
}

export function setDefaultAccount(db: DB, userId: string, id: string): boolean {
  if (!getAccount(db, userId, id)) return false
  db.transaction((tx) => {
    tx.update(yazioAccounts).set({ isDefault: false }).where(eq(yazioAccounts.userId, userId)).run()
    tx
      .update(yazioAccounts)
      .set({ isDefault: true, updatedAt: Date.now() })
      .where(eq(yazioAccounts.id, id))
      .run()
  })
  return true
}

export function removeAccount(db: DB, userId: string, id: string): boolean {
  const acc = getAccount(db, userId, id)
  if (!acc) return false
  db.delete(yazioAccounts).where(eq(yazioAccounts.id, id)).run()
  if (acc.isDefault) {
    const next = db
      .select({ id: yazioAccounts.id })
      .from(yazioAccounts)
      .where(eq(yazioAccounts.userId, userId))
      .get()
    if (next) {
      db.update(yazioAccounts).set({ isDefault: true }).where(eq(yazioAccounts.id, next.id)).run()
    }
  }
  return true
}

export function getCredentials(account: AccountRecord): StoredCredentials {
  return JSON.parse(decrypt(account.encCredentials)) as StoredCredentials
}

export function updateTokens(db: DB, accountId: string, encTokens: string): void {
  db.update(yazioAccounts)
    .set({ encTokens, updatedAt: Date.now() })
    .where(eq(yazioAccounts.id, accountId))
    .run()
}
