import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import type { DB } from '../../db/client.js'
import { createUser } from '../auth/users.repo.js'
import { env } from '../../config/env.js'
import { dateInTz } from '../meals/daytime.js'
import { foods } from '../../db/schema.js'
import { addWater, dayDrinkMl, insertEntries, recentFoods } from './diary.repo.js'
import { getDay } from './diary.service.js'

function seedFood(db: DB, id: string, name: string, baseUnit: 'g' | 'ml', source = 'custom', category: string | null = null) {
  const ts = Date.now()
  db.insert(foods)
    .values({ id, source, name, baseUnit, category, kcal: 40, version: 1, createdAt: ts, updatedAt: ts })
    .run()
}

let _n = 0
function entry(userId: string, date: string, foodId: string, name: string, amountG: number) {
  const ts = Date.now() + _n++
  return {
    id: `${foodId}-${ts}`,
    userId,
    date,
    daytime: 'lunch' as const,
    foodId,
    nameSnapshot: name,
    amountG,
    kcal: 10,
    origin: 'manual' as const,
    createdAt: ts,
    updatedAt: ts,
  }
}

describe('drinks → water counter & recent foods', () => {
  it('counts ml-foods toward the water total (excludes g-foods)', async () => {
    const db = createTestDb()
    const u = await createUser(db, 'w1', 'pw-123456')
    const today = dateInTz(new Date(), env.TZ)
    seedFood(db, 'f-water', 'Wasser', 'ml')
    seedFood(db, 'f-juice', 'Saft', 'ml')
    seedFood(db, 'f-cola', 'Colagetränk koffeinhaltig', 'g', 'bls', 'N') // BLS-Getränk in Gramm
    seedFood(db, 'f-apple', 'Apfel', 'g')
    insertEntries(db, [
      entry(u.id, today, 'f-water', 'Wasser', 500),
      entry(u.id, today, 'f-juice', 'Saft', 250),
      entry(u.id, today, 'f-cola', 'Cola', 200),
      entry(u.id, today, 'f-apple', 'Apfel', 150),
    ])

    // 500 + 250 (ml) + 200 (BLS-N in g ≈ ml); Apfel (g, kein Getränk) zählt nicht
    expect(dayDrinkMl(db, u.id, today)).toBe(950)

    const day = getDay(db, u.id, today)
    expect(day.water.fromDrinksMl).toBe(950)
    expect(day.water.totalMl).toBe(950) // kein manuelles Wasser

    addWater(db, u.id, today, 300, 'w1')
    expect(getDay(db, u.id, today).water.totalMl).toBe(1250) // 950 Getränke + 300 manuell
  })

  it('lists recently tracked foods grouped by food', async () => {
    const db = createTestDb()
    const u = await createUser(db, 'r1', 'pw-123456')
    const today = dateInTz(new Date(), env.TZ)
    seedFood(db, 'f-juice', 'Saft', 'ml')
    seedFood(db, 'f-apple', 'Apfel', 'g')
    insertEntries(db, [
      entry(u.id, today, 'f-apple', 'Apfel', 150),
      entry(u.id, today, 'f-juice', 'Saft', 250),
      entry(u.id, today, 'f-apple', 'Apfel', 90), // erneut → gruppiert, uses=2
    ])
    const recent = recentFoods(db, u.id, 10)
    expect(recent.length).toBe(2)
    const apple = recent.find((r) => r.foodId === 'f-apple')!
    expect(apple.uses).toBe(2)
    expect(apple.baseUnit).toBe('g')
    expect(recent.find((r) => r.foodId === 'f-juice')!.baseUnit).toBe('ml')
  })
})
