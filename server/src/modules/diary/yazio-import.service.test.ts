import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createAccount } from '../accounts/accounts.repo.js'
import { env } from '../../config/env.js'
import { dateInTz } from '../meals/daytime.js'
import { previousDay } from './streak.js'
import { listDayEntries } from './diary.repo.js'
import { importYazioHistory, NoAccountError, type HistoryClient } from './yazio-import.service.js'

const today = dateInTz(new Date(), env.TZ)
const yesterday = previousDay(today)

function fakeClient(byDate: Record<string, { id: string; product_id: string; daytime: string; amount: number }[]>) {
  const productsGet = vi.fn(async (id: string) => {
    if (id === 'p-dead') throw new Error('product gone')
    return {
      name: `Produkt ${id}`,
      producer: id === 'p1' ? 'Marke' : null,
      nutrients: { 'energy.energy': 2, 'nutrient.protein': 0.1, 'nutrient.carb': 0.2, 'nutrient.fat': 0.05 },
    }
  })
  const client = {
    user: {
      getConsumedItems: vi.fn(async ({ date }: { date: Date }) => {
        expect(date).toBeInstanceOf(Date) // the yazio lib rejects strings
        const key = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
        return {
          products: (byDate[key] ?? []).map((p) => ({
            ...p,
            date: key,
            serving: null,
            serving_quantity: null,
          })),
        }
      }),
    },
    products: { get: productsGet },
  } as unknown as HistoryClient
  return { client, productsGet }
}

describe('yazio history import', () => {
  it('imports entries with nutrient snapshots and caches product lookups', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'imp1', 'pw-123456')
    const account = createAccount(db, user.id, 'Y', { username: 'a@b.de', password: 'x' })
    const { client, productsGet } = fakeClient({
      [today]: [
        { id: 'c1', product_id: 'p1', daytime: 'breakfast', amount: 100 },
        { id: 'c2', product_id: 'p1', daytime: 'lunch', amount: 50 },
      ],
      [yesterday]: [{ id: 'c3', product_id: 'p2', daytime: 'dinner', amount: 200 }],
    })

    const result = await importYazioHistory(db, user.id, { accountId: account.id, days: 3 }, () => client)
    expect(result).toMatchObject({ daysScanned: 3, daysSkipped: 0, entriesImported: 3 })
    expect(productsGet).toHaveBeenCalledTimes(2) // p1 cached across items

    const entries = listDayEntries(db, user.id, today)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      nameSnapshot: 'Produkt p1 (Marke)',
      kcal: 200, // 2 kcal/g × 100 g
      origin: 'yazio_import',
      mirrorStatus: 'mirrored',
    })
  })

  it('imports recipe portions with fraction-of-total nutrients', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'imp-recipe', 'pw-123456')
    const account = createAccount(db, user.id, 'Y', { username: 'a@b.de', password: 'x' })
    const recipesGet = vi.fn(async () => ({
      name: 'Bolo Auflauf',
      portion_count: 4,
      nutrients: { 'energy.energy': 2000, 'nutrient.protein': 120, 'nutrient.carb': 200, 'nutrient.fat': 80 },
      servings: [{ amount: 800 }, { amount: 400 }],
    }))
    const client = {
      user: {
        getConsumedItems: vi.fn(async ({ date }: { date: Date }) => {
          const key = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })
          return {
            products: [],
            recipe_portions:
              key === today
                ? [
                    { id: 'rp1', date: key, daytime: 'dinner', recipe_id: 'r1', portion_count: 2 },
                    { id: 'rp2', date: key, daytime: 'lunch', recipe_id: 'r1', portion_count: 0.5 },
                  ]
                : [],
          }
        }),
      },
      products: { get: vi.fn() },
      recipes: { get: recipesGet },
    } as unknown as HistoryClient

    const result = await importYazioHistory(db, user.id, { accountId: account.id, days: 2 }, () => client)
    expect(result.entriesImported).toBe(2)
    expect(recipesGet).toHaveBeenCalledTimes(1) // cached across portions

    const entries = listDayEntries(db, user.id, today)
    // 2 of 4 portions: half the recipe total, 600 g of 1200 g
    expect(entries[0]).toMatchObject({
      nameSnapshot: 'Bolo Auflauf',
      kcal: 1000,
      protein: 60,
      amountG: 600,
      servingLabel: 'Portion',
      servingQuantity: 2,
      origin: 'yazio_import',
    })
    // 0.5 of 4 portions: an eighth
    expect(entries[1]).toMatchObject({ kcal: 250, amountG: 150 })
  })

  it('is idempotent per day on a second run', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'imp2', 'pw-123456')
    const account = createAccount(db, user.id, 'Y', { username: 'a@b.de', password: 'x' })
    const { client } = fakeClient({ [today]: [{ id: 'c1', product_id: 'p1', daytime: 'snack', amount: 30 }] })

    await importYazioHistory(db, user.id, { accountId: account.id, days: 2 }, () => client)
    const second = await importYazioHistory(db, user.id, { accountId: account.id, days: 2 }, () => client)
    expect(second.entriesImported).toBe(0)
    expect(second.daysSkipped).toBe(1) // only the day that actually has imported entries
    expect(listDayEntries(db, user.id, today)).toHaveLength(1)
  })

  it('skips serving-only items without a gram amount', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'imp-null', 'pw-123456')
    const account = createAccount(db, user.id, 'Y', { username: 'a@b.de', password: 'x' })
    const { client } = fakeClient({
      [today]: [
        { id: 'c1', product_id: 'p1', daytime: 'lunch', amount: null as unknown as number },
        { id: 'c2', product_id: 'p1', daytime: 'lunch', amount: 80 },
      ],
    })
    const result = await importYazioHistory(db, user.id, { accountId: account.id, days: 1 }, () => client)
    expect(result.entriesImported).toBe(1)
  })

  it('skips lines whose product cannot be resolved', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'imp3', 'pw-123456')
    const account = createAccount(db, user.id, 'Y', { username: 'a@b.de', password: 'x' })
    const { client } = fakeClient({
      [today]: [
        { id: 'c1', product_id: 'p-dead', daytime: 'lunch', amount: 100 },
        { id: 'c2', product_id: 'p1', daytime: 'lunch', amount: 100 },
      ],
    })
    const result = await importYazioHistory(db, user.id, { accountId: account.id, days: 1 }, () => client)
    expect(result.entriesImported).toBe(1)
  })

  it('throws NoAccountError without a linked account', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'imp4', 'pw-123456')
    await expect(importYazioHistory(db, user.id, { days: 7 })).rejects.toBeInstanceOf(NoAccountError)
  })
})
