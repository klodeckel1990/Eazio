import type { DB } from '../../db/client.js'
import { createAccount, type AccountSummary, type StoredCredentials } from './accounts.repo.js'
import { verifyCredentials } from '../yazio/client.js'

export type LinkResult =
  | { ok: true; account: AccountSummary }
  | { ok: false; reason: 'auth_failed' }

/** Verifies the Yazio credentials before persisting the (encrypted) account. */
export async function linkAccount(
  db: DB,
  userId: string,
  label: string,
  creds: StoredCredentials,
): Promise<LinkResult> {
  if (!(await verifyCredentials(creds))) {
    return { ok: false, reason: 'auth_failed' }
  }
  return { ok: true, account: createAccount(db, userId, label, creds) }
}
