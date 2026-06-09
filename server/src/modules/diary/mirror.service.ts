// Optional Yazio dual-write: the diary commits locally first, the mirror runs
// strictly afterwards and never blocks or fails a diary write. Every entry ends
// in a visible state — mirrored, skipped (no account / no confident product
// match) or failed (Yazio error). A wrong write is worse than no write, so
// product resolution is conservative: learned alias first, otherwise only an
// exact normalized-name search hit.

import type { DB } from '../../db/client.js'
import { getAccount, getDefaultAccount, type AccountRecord } from '../accounts/accounts.repo.js'
import { buildYazioClient } from '../yazio/client.js'
import { getAlias } from '../learning/aliases.repo.js'
import { normalizeName, buildSearchQuery } from '../matching/normalize.js'
import { searchCandidates, type SearchClient } from '../matching/matcher.js'
import { buildConsumedItem } from '../logging/consumed-item.js'
import type { LogClient } from '../logging/log.service.js'
import type { Daytime } from '../meals/daytime.js'
import { listPendingMirrors, setMirrorState, type DiaryEntryRow } from './diary.repo.js'

export type MirrorClient = LogClient & SearchClient

export type ClientFactory = (db: DB, account: AccountRecord) => MirrorClient

const defaultFactory: ClientFactory = (db, account) =>
  buildYazioClient(db, account) as unknown as MirrorClient

interface ResolvedProduct {
  productId: string
  serving: string | null
  servingQuantity: number | null
}

async function resolveProduct(
  client: MirrorClient,
  db: DB,
  userId: string,
  name: string,
): Promise<ResolvedProduct | null> {
  const normalized = normalizeName(name)
  const alias = getAlias(db, userId, normalized)
  if (alias) {
    return { productId: alias.productId, serving: null, servingQuantity: null }
  }
  const candidates = await searchCandidates(client, buildSearchQuery(name))
  const exact = candidates.find((c) => normalizeName(c.name) === normalized)
  return exact ? { productId: exact.productId, serving: null, servingQuantity: null } : null
}

/** Mirrors the given pending entries to the user's default Yazio account. */
export async function mirrorEntries(
  db: DB,
  userId: string,
  entryIds: string[],
  factory: ClientFactory = defaultFactory,
): Promise<void> {
  const entries = listPendingMirrors(db, userId, entryIds)
  if (entries.length === 0) return
  const account = getDefaultAccount(db, userId)
  if (!account) {
    for (const e of entries) setMirrorState(db, e.id, 'skipped', { reason: 'no_account' })
    return
  }
  const client = factory(db, account)
  for (const entry of entries) {
    try {
      const product = await resolveProduct(client, db, userId, entry.nameSnapshot)
      if (!product) {
        setMirrorState(db, entry.id, 'skipped', { accountId: account.id, reason: 'no_match' })
        continue
      }
      const item = buildConsumedItem(
        { productId: product.productId, amountGrams: entry.amountG },
        entry.date,
        entry.daytime as Daytime,
      )
      await client.user.addConsumedItem(item)
      setMirrorState(db, entry.id, 'mirrored', {
        accountId: account.id,
        productId: product.productId,
        consumedId: item.id,
      })
    } catch (err) {
      setMirrorState(db, entry.id, 'failed', {
        accountId: account.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/** Best-effort removal of a mirrored item when its diary entry is deleted. */
export async function unmirrorEntry(
  db: DB,
  userId: string,
  entry: DiaryEntryRow,
  factory: ClientFactory = defaultFactory,
): Promise<void> {
  if (entry.mirrorStatus !== 'mirrored' || !entry.mirrorJson) return
  try {
    const mirror = JSON.parse(entry.mirrorJson) as { accountId?: string; consumedId?: string }
    if (!mirror.accountId || !mirror.consumedId) return
    const account = getAccount(db, userId, mirror.accountId)
    if (!account) return
    await factory(db, account).user.removeConsumedItem(mirror.consumedId)
  } catch {
    // the local delete already happened; a stale Yazio item is acceptable
  }
}
