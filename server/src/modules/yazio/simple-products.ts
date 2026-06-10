// Yazio "simple products": free-form quick entries, including the AI photo/
// text tracking ("Frikadellen mit Kartoffelsalat …"). The yazio npm package's
// zod schema silently drops the simple_products array from consumed-items, so
// this fetches the raw v15 endpoint with the account's cached bearer token.

import type { DB } from '../../db/client.js'
import type { AccountRecord } from '../accounts/accounts.repo.js'
import { cachedTokenGetter } from './recipes.js'

export interface YazioSimpleProduct {
  id: string
  daytime: string
  name: string
  /** absolute totals for the entry as eaten — NOT per gram */
  nutrients: Record<string, number>
}

export type SimpleProductsFetcher = (date: string) => Promise<YazioSimpleProduct[]>

export function buildSimpleProductsFetcher(db: DB, account: AccountRecord): SimpleProductsFetcher {
  const getToken = cachedTokenGetter(db, account)

  return async (date: string): Promise<YazioSimpleProduct[]> => {
    const token = getToken()
    if (!token) throw new Error('no yazio token cached')
    const res = await fetch(
      `https://yzapi.yazio.com/v15/user/consumed-items?date=${encodeURIComponent(date)}`,
      {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) throw new Error(`consumed-items fetch failed: ${res.status}`)
    const body = (await res.json()) as { simple_products?: YazioSimpleProduct[] }
    return body.simple_products ?? []
  }
}
