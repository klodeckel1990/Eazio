import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { createCustomFood, upsertSourcedFood } from './foods.repo.js'
import { upsertFoodAlias } from './food-aliases.repo.js'
import { matchFoodText } from './foods.service.js'
import { buildSearchTerms } from './search-terms.js'
import type { AiRerank } from './ai-match.js'

const noOff = async () => []

function seed(db: ReturnType<typeof createTestDb>, code: string, name: string, kcal: number) {
  const now = Date.now()
  upsertSourcedFood(db, {
    id: `bls:${code}`,
    source: 'bls',
    sourceId: code,
    name,
    searchTerms: buildSearchTerms(name),
    kcal,
    createdAt: now,
    updatedAt: now,
  })
  return `bls:${code}`
}

async function setup() {
  const db = createTestDb()
  const user = await createUser(db, `ai-${Math.random().toString(36).slice(2, 8)}`, 'pw-123456')
  // both match the query "paprika…" — FTS ranks the dish variants too
  const grill = seed(db, 'P1', 'Paprika gegrillt', 80)
  const raw = seed(db, 'P2', 'Gemüsepaprika rot, roh', 37)
  const salad = seed(db, 'P3', 'Paprikasalat mit Essigmarinade', 60)
  return { db, user, grill, raw, salad }
}

describe('matchFoodText with AI rerank', () => {
  it('applies the AI pick, reorders candidates and caches it globally', async () => {
    const { db, user, raw } = await setup()
    const rerank: AiRerank = vi.fn(async (lines) =>
      lines.map((l) => l.candidates.find((c) => c.id === raw)?.id ?? null),
    )

    const lines = await matchFoodText(db, user.id, 'Paprika', noOff, rerank)
    expect(rerank).toHaveBeenCalledTimes(1)
    expect(lines[0]!.selectedFoodId).toBe(raw)
    expect(lines[0]!.candidates[0]!.id).toBe(raw)

    // second user benefits from the global cache — no second AI call
    const user2 = await createUser(db, 'ai-second', 'pw-123456')
    const rerank2: AiRerank = vi.fn(async (l) => l.map(() => null))
    const again = await matchFoodText(db, user2.id, 'Paprika', noOff, rerank2)
    expect(again[0]!.selectedFoodId).toBe(raw)
    expect(rerank2).not.toHaveBeenCalled()
  })

  it('keeps the FTS order when the AI returns null', async () => {
    const { db, user } = await setup()
    const rerank: AiRerank = vi.fn(async (l) => l.map(() => null))
    const lines = await matchFoodText(db, user.id, 'Paprika', noOff, rerank)
    expect(lines[0]!.selectedFoodId).toBe(lines[0]!.candidates[0]!.id)
  })

  it('a learned user alias wins — the AI is not consulted for that line', async () => {
    const { db, user, salad } = await setup()
    upsertFoodAlias(db, user.id, 'paprika', { foodId: salad, defaultAmountG: 200, defaultServingLabel: null })
    const rerank: AiRerank = vi.fn(async (l) => l.map(() => null))
    const lines = await matchFoodText(db, user.id, 'Paprika', noOff, rerank)
    expect(lines[0]!.selectedFoodId).toBe(salad)
    expect(lines[0]!.suggestedAmountG).toBe(200)
    expect(rerank).not.toHaveBeenCalled()
  })

  it('does not cache picks of custom foods globally', async () => {
    const { db, user } = await setup()
    const custom = createCustomFood(db, user.id, { name: 'Paprika-Mix (meins)', kcal: 50 })
    const rerank: AiRerank = vi.fn(async (lines) =>
      lines.map((l) => l.candidates.find((c) => c.id === custom.id)?.id ?? null),
    )
    await matchFoodText(db, user.id, 'Paprika', noOff, rerank)

    // a different user must not inherit the private pick
    const user2 = await createUser(db, 'ai-third', 'pw-123456')
    const rerank2: AiRerank = vi.fn(async (l) => l.map(() => null))
    const lines = await matchFoodText(db, user2.id, 'Paprika', noOff, rerank2)
    expect(lines[0]!.candidates.some((c) => c.id === custom.id)).toBe(false)
    expect(rerank2).toHaveBeenCalledTimes(1) // cache empty → AI consulted again
  })
})
