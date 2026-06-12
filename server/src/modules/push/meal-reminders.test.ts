import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { updateSettings } from '../settings/settings.repo.js'
import { insertEntries } from '../diary/diary.repo.js'
import { upsertToken } from './push.repo.js'
import type { Sender } from './reminder-job.js'
import { runReminderTick } from './reminder-job.js'
import {
  mealReminderTarget,
  runMealReminderTick,
  typicalLogTime,
  type MealSlot,
} from './meal-reminders.js'

const TZ = 'Europe/Berlin'
const TODAY = '2026-06-12'

function fakeSender(log: { token: string; title: string }[]): Sender {
  return async (token, msg) => {
    log.push({ token, title: msg.title })
    return { ok: true, status: 200, reason: null, env: 'sandbox' }
  }
}

/** Eintrag am `date` um `hhmm` Berlin-Zeit (Sommerzeit: UTC+2). */
function logAt(
  db: ReturnType<typeof createTestDb>,
  userId: string,
  date: string,
  daytime: string,
  hhmm: string,
  origin = 'manual',
) {
  const [h, m] = hhmm.split(':').map(Number)
  const createdAt = Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`)
  insertEntries(db, [
    {
      id: randomUUID(),
      userId,
      date,
      daytime,
      foodId: null,
      nameSnapshot: 'Test',
      amountG: 100,
      kcal: 100,
      origin,
      createdAt,
      updatedAt: createdAt,
    },
  ])
}

function daysBefore(n: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

async function setupHabitUser(db: ReturnType<typeof createTestDb>, slot: MealSlot, hhmm: string) {
  const user = await createUser(db, `u-${randomUUID().slice(0, 8)}`, 'pw-123456')
  updateSettings(db, user.id, { mealReminders: true })
  upsertToken(db, user.id, `tok-${user.id}`, 'ios')
  for (let i = 1; i <= 7; i++) logAt(db, user.id, daysBefore(i), slot, hhmm)
  return user
}

function at(hhmmBerlin: string): Date {
  return new Date(`${TODAY}T${hhmmBerlin}:00+02:00`)
}

describe('typicalLogTime / mealReminderTarget', () => {
  it('returns the median log time of the last weeks', async () => {
    const db = createTestDb()
    const user = await setupHabitUser(db, 'lunch', '12:30')
    expect(typicalLogTime(db, user.id, 'lunch', TODAY, TZ)).toBe('12:30')
    expect(mealReminderTarget(db, user.id, 'lunch', TODAY, TZ)).toBe('13:15') // +45 min
  })

  it('needs enough history — sparse slots get no reminder', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'sparse', 'pw-123456')
    for (let i = 1; i <= 3; i++) logAt(db, user.id, daysBefore(i), 'breakfast', '08:00')
    expect(typicalLogTime(db, user.id, 'breakfast', TODAY, TZ)).toBeNull()
  })

  it('ignores yazio imports (createdAt = import time, not meal time)', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'importer', 'pw-123456')
    for (let i = 1; i <= 7; i++) logAt(db, user.id, daysBefore(i), 'dinner', '23:50', 'yazio_import')
    expect(typicalLogTime(db, user.id, 'dinner', TODAY, TZ)).toBeNull()
  })

  it('clamps the target into the slot window', async () => {
    const db = createTestDb()
    // Frühaufsteher: 06:00-Frühstück → Erinnerung nicht vor 07:30
    const user = await setupHabitUser(db, 'breakfast', '06:00')
    expect(mealReminderTarget(db, user.id, 'breakfast', TODAY, TZ)).toBe('07:30')
  })
})

describe('runMealReminderTick', () => {
  it('reminds after the learned time when the slot is empty', async () => {
    const db = createTestDb()
    await setupHabitUser(db, 'lunch', '12:30')
    const sent: { token: string; title: string }[] = []
    // 13:00 — noch vor Median+45
    expect(await runMealReminderTick(db, { now: at('13:00'), send: fakeSender(sent) })).toBe(0)
    // 13:20 — Ziel 13:15 überschritten
    expect(await runMealReminderTick(db, { now: at('13:20'), send: fakeSender(sent) })).toBe(1)
    expect(sent[0]!.title).toContain('Mittag')
    // gleicher Tag: kein zweiter Push für den Slot
    expect(await runMealReminderTick(db, { now: at('14:00'), send: fakeSender(sent) })).toBe(0)
  })

  it('stays silent when the meal is already tracked', async () => {
    const db = createTestDb()
    const user = await setupHabitUser(db, 'lunch', '12:30')
    logAt(db, user.id, TODAY, 'lunch', '12:10')
    const sent: { token: string; title: string }[] = []
    expect(await runMealReminderTick(db, { now: at('16:00'), send: fakeSender(sent) })).toBe(0)
  })

  it('lets expired slots pass — no breakfast nag in the afternoon', async () => {
    const db = createTestDb()
    await setupHabitUser(db, 'breakfast', '08:30')
    const sent: { token: string; title: string }[] = []
    expect(await runMealReminderTick(db, { now: at('15:00'), send: fakeSender(sent) })).toBe(0)
  })

  it('suppresses the evening reminder after a meal nudge went out', async () => {
    const db = createTestDb()
    const user = await setupHabitUser(db, 'dinner', '18:30')
    updateSettings(db, user.id, { reminderPush: true, reminderTime: '19:30' })
    const sent: { token: string; title: string }[] = []
    expect(await runMealReminderTick(db, { now: at('19:20'), send: fakeSender(sent) })).toBe(1)
    expect(await runReminderTick(db, { now: at('19:35'), send: fakeSender(sent) })).toBe(0)
    expect(sent).toHaveLength(1)
  })
})
