// Recipe lookups against the Yazio API. The yazio npm package has no recipes
// endpoint, so this goes straight to the v15 API with the account's cached
// bearer token (kept fresh by the package's own calls during an import run).

import { and, eq } from 'drizzle-orm'
import type { DB } from '../../db/client.js'
import { yazioAccounts } from '../../db/schema.js'
import { decrypt } from '../../crypto/aes.js'
import type { AccountRecord } from '../accounts/accounts.repo.js'

export interface YazioRecipeDetails {
  name: string
  /** how many portions the recipe yields; nutrients are the recipe TOTAL */
  portion_count: number
  nutrients: Record<string, number>
  servings?: { amount: number | null }[]
}

export type RecipeFetcher = (id: string) => Promise<YazioRecipeDetails>

/** Reads the account's cached bearer token (refreshed by the yazio package's
 *  own calls during an import run) for raw v15 API requests. */
export function cachedTokenGetter(db: DB, account: AccountRecord): () => string | null {
  return () => {
    const row = db
      .select({ encTokens: yazioAccounts.encTokens })
      .from(yazioAccounts)
      .where(and(eq(yazioAccounts.id, account.id), eq(yazioAccounts.userId, account.userId)))
      .get()
    if (!row?.encTokens) return null
    return (JSON.parse(decrypt(row.encTokens)) as { access_token: string }).access_token
  }
}

export function buildRecipeFetcher(db: DB, account: AccountRecord): RecipeFetcher {
  const getToken = cachedTokenGetter(db, account)

  return async (id: string): Promise<YazioRecipeDetails> => {
    const token = getToken()
    if (!token) throw new Error('no yazio token cached')
    const res = await fetch(`https://yzapi.yazio.com/v15/recipes/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`recipe fetch failed: ${res.status}`)
    return (await res.json()) as YazioRecipeDetails
  }
}
