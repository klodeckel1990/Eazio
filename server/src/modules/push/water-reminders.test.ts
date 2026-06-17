import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { updateSettings } from '../settings/settings.repo.js'
import { addWater } from '../diary/diary.repo.js'
import { upsertToken } from './push.repo.js'
import type { Sender } from './reminder-job.js'
import { runWaterReminderTick } from './water-reminders.js'

const TODAY = '2026-06-12'

function fakeSender(log: { token: string; title: string }[]): Sender {
  return async (token, msg) => {
    log.push({ token, title: msg.title })
    return { ok: true, status: 200, reason: null, env: 'sandbox' }
  }
}

function at(hhmmBerlin: string): Date {
  return new Date(`${TODAY}T${hhmmBerlin}:00+02:00`) // Sommerzeit: Berlin = UTC+2
}

async function setupWaterUser(db: ReturnType<typeof createTestDb>, on = true) {
  const user = await createUser(db, `u-${randomUUID().slice(0, 8)}`, 'pw-123456')
  if (on) updateSettings(db, user.id, { waterReminders: true })
  upsertToken(db, user.id, `tok-${user.id}`, 'ios')
  return user
}

describe('runWaterReminderTick', () => {
  it('reminds in the afternoon when below the water goal — once per day', async () => {
    const db = createTestDb()
    const user = await setupWaterUser(db)
    addWater(db, user.id, TODAY, 500, 'w1') // 500 < 2000 (Default-Ziel)
    const sent: { token: string; title: string }[] = []
    // 15:00 — vor 16:00 → nichts
    expect(await runWaterReminderTick(db, { now: at('15:00'), send: fakeSender(sent) })).toBe(0)
    // 16:30 — ab 16:00, Ziel nicht erreicht → Push
    expect(await runWaterReminderTick(db, { now: at('16:30'), send: fakeSender(sent) })).toBe(1)
    expect(sent[0]!.title).toContain('Wasser')
    // gleicher Tag → kein zweiter Push
    expect(await runWaterReminderTick(db, { now: at('18:00'), send: fakeSender(sent) })).toBe(0)
  })

  it('stays silent when the goal is already reached', async () => {
    const db = createTestDb()
    const user = await setupWaterUser(db)
    addWater(db, user.id, TODAY, 2000, 'w1') // = Ziel
    expect(await runWaterReminderTick(db, { now: at('16:30'), send: fakeSender([]) })).toBe(0)
  })

  it('respects the opt-out (setting off)', async () => {
    const db = createTestDb()
    await setupWaterUser(db, false) // waterReminders default false, kein Wasser getrunken
    expect(await runWaterReminderTick(db, { now: at('16:30'), send: fakeSender([]) })).toBe(0)
  })
})
