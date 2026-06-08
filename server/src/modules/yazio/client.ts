import { Yazio } from 'yazio'
import type { Token } from 'yazio/auth'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { yazioAccounts } from '../../db/schema.js'
import { encrypt, decrypt } from '../../crypto/aes.js'
import {
  getCredentials,
  updateTokens,
  type AccountRecord,
  type StoredCredentials,
} from '../accounts/accounts.repo.js'
import type { YazioToken } from './types.js'

// YazioInit is the first constructor parameter type, derived from the library itself.
type YazioInit = ConstructorParameters<typeof Yazio>[0]

/** Builds a Yazio client for a stored account with persistent token caching. */
export function buildYazioClient(db: DB, account: AccountRecord): Yazio {
  const creds = getCredentials(account)

  // The token resolver: reads the freshest cached token from the DB each call.
  // Returns null when no token is stored yet (library will log in with credentials).
  const tokenResolver = (): Token | null => {
    const row = db
      .select({ encTokens: yazioAccounts.encTokens })
      .from(yazioAccounts)
      .where(and(eq(yazioAccounts.id, account.id), eq(yazioAccounts.userId, account.userId)))
      .get()
    if (!row?.encTokens) return null
    return JSON.parse(decrypt(row.encTokens)) as Token
  }

  // The onRefresh callback: persists freshly issued tokens (encrypted, user-scoped).
  const onRefresh = ({ token }: { token: Token }): void => {
    const yazioToken = token as YazioToken
    updateTokens(db, account.userId, account.id, encrypt(JSON.stringify(yazioToken)))
  }

  const init: YazioInit = {
    credentials: creds,
    token: tokenResolver,
    onRefresh,
  }

  return new Yazio(init)
}

/** Confirms a client can authenticate by fetching the user profile. */
export async function verifyConnection(client: Yazio): Promise<boolean> {
  try {
    await client.user.get()
    return true
  } catch {
    return false
  }
}

/** One-shot credential check (no token persistence) used when linking an account. */
export function verifyCredentials(creds: StoredCredentials): Promise<boolean> {
  const init: YazioInit = { credentials: creds }
  return verifyConnection(new Yazio(init))
}
