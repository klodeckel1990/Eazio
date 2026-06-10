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

describe('goals onboarding', () => {
  it('computes and persists the plan from the questionnaire', async () => {
    const db = createTestDb()
    const app = buildApp(db, { bootstrapToken: BOOTSTRAP })
    const headers = await login(app, 'onb1')

    const res = await app.inject({
      method: 'POST',
      url: '/api/goals/onboarding',
      headers,
      payload: {
        gender: 'male',
        birthYear: 1990,
        heightCm: 180,
        weightKg: 85,
        activityLevel: 'moderate',
        goalType: 'lose',
        weightGoalKg: 78,
        paceKgWeek: 0.5,
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { goals: Record<string, unknown>; plan: Record<string, unknown> }
    expect(body.plan.kcalTarget).toBe(2240)
    expect(body.goals.kcalTarget).toBe(2240)
    expect(body.goals.goalType).toBe('lose')
    expect(body.goals.onboardedAt).toBeTruthy()

    // persisted — GET reflects profile and targets
    const get = await app.inject({ method: 'GET', url: '/api/goals', headers })
    const goals = get.json() as Record<string, unknown>
    expect(goals.heightCm).toBe(180)
    expect(goals.weightGoalKg).toBe(78)
    expect(goals.onboardedAt).toBeTruthy()
  })

  it('skip marks onboarding as seen without touching the plan', async () => {
    const db = createTestDb()
    const app = buildApp(db, { bootstrapToken: BOOTSTRAP })
    const headers = await login(app, 'onb2')

    const before = (await app.inject({ method: 'GET', url: '/api/goals', headers })).json() as {
      onboardedAt: number | null
      kcalTarget: number
    }
    expect(before.onboardedAt).toBeNull()

    const res = await app.inject({ method: 'POST', url: '/api/goals/onboarding/skip', headers })
    expect(res.statusCode).toBe(200)
    const after = (await app.inject({ method: 'GET', url: '/api/goals', headers })).json() as {
      onboardedAt: number | null
      kcalTarget: number
    }
    expect(after.onboardedAt).toBeTruthy()
    expect(after.kcalTarget).toBe(before.kcalTarget)
  })

  it('rejects nonsense input', async () => {
    const db = createTestDb()
    const app = buildApp(db, { bootstrapToken: BOOTSTRAP })
    const headers = await login(app, 'onb3')
    const res = await app.inject({
      method: 'POST',
      url: '/api/goals/onboarding',
      headers,
      payload: { gender: 'male', birthYear: 1800, heightCm: 180, weightKg: 85, activityLevel: 'moderate', goalType: 'lose' },
    })
    expect(res.statusCode).toBe(400)
  })
})
