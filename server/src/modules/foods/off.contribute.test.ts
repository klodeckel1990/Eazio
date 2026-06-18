import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createCustomFood, getOffContribution, upsertSourcedFood, type NewFood } from './foods.repo.js'
import { contributeFood } from './foods.service.js'
import type { OffContributeResult } from './off.write.js'

function blsFood(code: string, name: string): NewFood {
  const now = Date.now()
  return { id: `bls:${code}`, source: 'bls', sourceId: code, name, kcal: 100, createdAt: now, updatedAt: now }
}

/** Spy-Writer: zählt Aufrufe und liefert ein konfigurierbares Ergebnis. */
function spyWriter(result: OffContributeResult) {
  const calls: string[] = []
  const fn = async (p: { barcode: string }) => {
    calls.push(p.barcode)
    return result
  }
  return Object.assign(fn, { calls })
}

describe('contributeFood', () => {
  it('contributes an owned barcoded custom food and is idempotent on success', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'u1', 'pw-123456')
    const food = createCustomFood(db, user.id, { name: 'Protein-Müsli', barcode: '40111213', kcal: 380 })
    const write = spyWriter({ ok: true, statusVerbose: 'fields saved' })

    const first = await contributeFood(db, user.id, food.id, write)
    expect(first).toEqual({ kind: 'done', status: 'sent', detail: 'fields saved' })
    expect(write.calls).toEqual(['40111213'])
    expect(getOffContribution(db, food.id)?.status).toBe('sent')

    // bereits gesendet → kein erneuter OFF-Aufruf
    const second = await contributeFood(db, user.id, food.id, write)
    expect(second).toEqual({ kind: 'done', status: 'already', detail: null })
    expect(write.calls).toEqual(['40111213'])
  })

  it('rejects foods without a barcode', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'u2', 'pw-123456')
    const food = createCustomFood(db, user.id, { name: 'Selbstgemacht', kcal: 200 })
    const write = spyWriter({ ok: true, statusVerbose: 'fields saved' })
    expect(await contributeFood(db, user.id, food.id, write)).toEqual({ kind: 'no_barcode' })
    expect(write.calls).toEqual([])
  })

  it('does not contribute shared bls/off rows or foreign custom foods', async () => {
    const db = createTestDb()
    const owner = await createUser(db, 'owner', 'pw-123456')
    const other = await createUser(db, 'other', 'pw-123456')
    upsertSourcedFood(db, blsFood('B1', 'Banane roh'))
    const own = createCustomFood(db, owner.id, { name: 'Mein Produkt', barcode: '40111299', kcal: 250 })
    const write = spyWriter({ ok: true, statusVerbose: 'fields saved' })

    expect(await contributeFood(db, owner.id, 'bls:B1', write)).toEqual({ kind: 'not_found' })
    // fremder Nutzer sieht/contributet das Produkt nicht
    expect(await contributeFood(db, other.id, own.id, write)).toEqual({ kind: 'not_found' })
    expect(write.calls).toEqual([])
  })

  it('records failures and allows a retry (not marked as already)', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'u3', 'pw-123456')
    const food = createCustomFood(db, user.id, { name: 'Fehlversuch', barcode: '40111300', kcal: 120 })
    const fail = spyWriter({ ok: false, statusVerbose: 'network error' })

    const r1 = await contributeFood(db, user.id, food.id, fail)
    expect(r1).toEqual({ kind: 'done', status: 'failed', detail: 'network error' })
    expect(getOffContribution(db, food.id)?.status).toBe('failed')

    // erneuter Versuch ruft OFF wieder auf (nicht „already")
    const ok = spyWriter({ ok: true, statusVerbose: 'fields saved' })
    const r2 = await contributeFood(db, user.id, food.id, ok)
    expect(r2.kind === 'done' && r2.status).toBe('sent')
    expect(ok.calls).toEqual(['40111300'])
  })
})
