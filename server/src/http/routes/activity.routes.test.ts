import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'

const BOOTSTRAP = 'test-bootstrap-token'

async function login(app: ReturnType<typeof buildApp>, username: string) {
  await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { token: BOOTSTRAP, username, password: 'pw-123456' },
  })
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: 'pw-123456' },
  })
  return { authorization: `Bearer ${(res.json() as { token: string }).token}` }
}

describe('diary month overview', () => {
  it('returns kcal per logged day and the target', async () => {
    const db = createTestDb()
    const app = buildApp(db, { bootstrapToken: BOOTSTRAP })
    const headers = await login(app, 'cal1')

    await app.inject({
      method: 'POST',
      url: '/api/diary/entries',
      headers,
      payload: { date: '2026-06-06', daytime: 'lunch', lines: [{ name: 'Testessen', kcal: 700, amountG: 350 }] },
    })
    const res = await app.inject({ method: 'GET', url: '/api/diary/month?month=2026-06', headers })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { month: string; kcalTarget: number; days: { date: string; kcal: number }[] }
    expect(body.kcalTarget).toBeGreaterThan(0)
    expect(body.days).toContainEqual({ date: '2026-06-06', kcal: 700 })
  })
})

describe('activity sync', () => {
  it('upserts steps/active kcal and merges partial updates', async () => {
    const db = createTestDb()
    const app = buildApp(db, { bootstrapToken: BOOTSTRAP })
    const headers = await login(app, 'act1')

    const res = await app.inject({
      method: 'PUT',
      url: '/api/activity/day',
      headers,
      payload: { steps: 8432, activeKcal: 412 },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { activity: { steps: number } }).activity.steps).toBe(8432)

    // partial update keeps the other fields
    const res2 = await app.inject({
      method: 'PUT',
      url: '/api/activity/day',
      headers,
      payload: { steps: 9000 },
    })
    const a = (res2.json() as { activity: { steps: number; activeKcal: number } }).activity
    expect(a.steps).toBe(9000)
    expect(a.activeKcal).toBe(412)

    // the diary day exposes the activity, budget NOT extended by default
    const day = (await app.inject({ method: 'GET', url: '/api/diary', headers })).json() as {
      activity: { steps: number; countedKcal: number }
      goals: { kcalTarget: number }
      remainingKcal: number
    }
    expect(day.activity.steps).toBe(9000)
    expect(day.activity.countedKcal).toBe(0)
    expect(day.remainingKcal).toBe(day.goals.kcalTarget)
  })

  it('weight sync updates the profile and the budget setting counts active kcal', async () => {
    const db = createTestDb()
    const app = buildApp(db, { bootstrapToken: BOOTSTRAP })
    const headers = await login(app, 'act2')

    const res = await app.inject({
      method: 'PUT',
      url: '/api/activity/day',
      headers,
      payload: { activeKcal: 300, weightKg: 83.4 },
    })
    expect((res.json() as { goals: { weightKg: number } }).goals.weightKg).toBe(83.4)

    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers,
      payload: { activityBudget: true },
    })
    const day = (await app.inject({ method: 'GET', url: '/api/diary', headers })).json() as {
      activity: { countedKcal: number }
      goals: { kcalTarget: number; weightKg: number }
      remainingKcal: number
    }
    expect(day.activity.countedKcal).toBe(300)
    expect(day.remainingKcal).toBe(day.goals.kcalTarget + 300)
    expect(day.goals.weightKg).toBe(83.4)

    // widget budget matches the diary budget
    const widget = (await app.inject({ method: 'GET', url: '/api/widget/summary', headers })).json() as {
      kcalTarget: number
      kcalRemaining: number
    }
    expect(widget.kcalRemaining).toBe(day.remainingKcal)
  })
})
