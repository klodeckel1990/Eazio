import { describe, it, expect, vi } from 'vitest'

// Yazio client must NEVER be reached when a cross-user request is correctly
// rejected: ownership checks short-circuit before any client is built. If a
// regression lets a request through, buildYazioClient throws → 500 → test fails.
vi.mock('../../modules/yazio/client.js', () => ({
  verifyCredentials: vi.fn().mockResolvedValue(true),
  buildYazioClient: vi.fn(() => {
    throw new Error('SECURITY: Yazio client reached for a foreign account — isolation broken')
  }),
}))

import { createTestDb } from '../../db/test-db.js'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE } from '../../modules/auth/sessions.js'
import { createUser } from '../../modules/auth/users.repo.js'
import { createAccount } from '../../modules/accounts/accounts.repo.js'
import { createLogEvent } from '../../modules/logging/log-events.repo.js'
import { createPreset } from '../../modules/presets/presets.repo.js'
import { createRecipe } from '../../modules/recipes/recipes.repo.js'

/**
 * Cross-user isolation: a logged-in user (Bob) must not be able to read, use,
 * mutate or delete ANY resource owned by another user (Alice) — above all her
 * linked Yazio account and anything that would touch her Yazio data.
 */
describe('cross-user data isolation', () => {
  async function setup() {
    const db = createTestDb()
    const app = buildApp(db)

    // Alice: owns a Yazio account + a log event + a preset + a recipe.
    const alice = await createUser(db, 'alice', 'pw-123456')
    const aAccount = createAccount(db, alice.id, 'Alice-Konto', {
      username: 'alice@yazio.de',
      password: 'alice-secret',
    })
    const aLogId = createLogEvent(db, {
      userId: alice.id,
      yazioAccountId: aAccount.id,
      date: '2026-06-01',
      daytime: 'breakfast',
      status: 'logged',
      items: [],
      consumedIds: ['consumed-1'],
    })
    const aPreset = createPreset(db, alice.id, 'Alice-Preset', [
      { rawText: '1 Banane', productId: 'prod-1', amountG: 120 },
    ])
    const aRecipe = createRecipe(db, alice.id, {
      title: 'Alice-Rezept',
      servings: 1,
      sourceUrl: null,
      sourceType: 'text',
      difficulty: null,
      totalMinutes: null,
      ingredients: [{ raw: '1 Banane', quantity: '1', unit: '', name: 'Banane' }],
      steps: [],
    })

    // Bob: a separate logged-in user with no accounts of his own.
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'bob', email: 'bob@example.com', password: 'pw-123456' },
    })
    expect(reg.statusCode).toBe(201)
    const bobCookieValue = reg.cookies.find((c) => c.name === SESSION_COOKIE)!.value
    const bob = `${SESSION_COOKIE}=${bobCookieValue}`

    return { app, bob, aAccount, aLogId, aPreset, aRecipe }
  }

  it("Bob's account list never contains Alice's account", async () => {
    const { app, bob, aAccount } = await setup()
    const res = await app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie: bob } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(0)
    expect(res.body).not.toContain(aAccount.id)
    expect(res.body).not.toContain('alice@yazio.de')
  })

  it("Bob cannot match/search/log against Alice's Yazio account", async () => {
    const { app, bob, aAccount } = await setup()

    const match = await app.inject({
      method: 'POST', url: '/api/match', headers: { cookie: bob },
      payload: { text: '100 g Haferflocken', accountId: aAccount.id },
    })
    expect(match.statusCode).toBe(409) // no_account — Alice's id is invisible to Bob

    const search = await app.inject({
      method: 'POST', url: '/api/search', headers: { cookie: bob },
      payload: { query: 'Banane', accountId: aAccount.id },
    })
    expect(search.statusCode).toBe(409)

    const log = await app.inject({
      method: 'POST', url: '/api/log', headers: { cookie: bob },
      payload: { accountId: aAccount.id, lines: [{ productId: 'p', name: 'x', amountGrams: 100 }] },
    })
    expect(log.statusCode).toBe(409)
  })

  it("Bob cannot set-default, delete or undo against Alice's account/log", async () => {
    const { app, bob, aAccount, aLogId } = await setup()

    const def = await app.inject({
      method: 'PATCH', url: `/api/accounts/${aAccount.id}/default`, headers: { cookie: bob },
    })
    expect(def.statusCode).toBe(404)

    const del = await app.inject({
      method: 'DELETE', url: `/api/accounts/${aAccount.id}`, headers: { cookie: bob },
    })
    expect(del.statusCode).toBe(404)

    const undo = await app.inject({
      method: 'POST', url: `/api/log/${aLogId}/undo`, headers: { cookie: bob },
    })
    expect(undo.statusCode).toBe(404)
  })

  it("Bob cannot read or delete Alice's presets and recipes", async () => {
    const { app, bob, aPreset, aRecipe } = await setup()

    expect((await app.inject({ method: 'GET', url: `/api/presets/${aPreset.id}`, headers: { cookie: bob } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/api/presets/${aPreset.id}`, headers: { cookie: bob } })).statusCode).toBe(404)

    expect((await app.inject({ method: 'GET', url: `/api/recipes/${aRecipe.id}`, headers: { cookie: bob } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'PATCH', url: `/api/recipes/${aRecipe.id}`, headers: { cookie: bob }, payload: { isFavorite: true } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/api/recipes/${aRecipe.id}`, headers: { cookie: bob } })).statusCode).toBe(404)
  })
})
