import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb } from '../../db/test-db.js'
import { createUser } from '../auth/users.repo.js'
import { updateSettings } from '../settings/settings.repo.js'
import { insertEntries } from '../diary/diary.repo.js'
import { upsertToken, listUserTokens } from './push.repo.js'
import { localDayAndTime, runReminderTick, type Sender } from './reminder-job.js'

const TZ = 'Europe/Berlin'

function fakeSender(log: string[], result: Partial<Awaited<ReturnType<Sender>>> = {}): Sender {
  return async (token) => {
    log.push(token)
    return { ok: true, status: 200, reason: null, env: 'sandbox', ...result }
  }
}

async function setupUser(db: ReturnType<typeof createTestDb>, time = '19:30') {
  const user = await createUser(db, `u-${randomUUID().slice(0, 8)}`, 'pw-123456')
  updateSettings(db, user.id, { reminderPush: true, reminderTime: time })
  upsertToken(db, user.id, `tok-${user.id}`, 'ios')
  return user
}

function logEntry(db: ReturnType<typeof createTestDb>, userId: string, date: string) {
  insertEntries(db, [
    {
      id: randomUUID(),
      userId,
      date,
      daytime: 'dinner',
      foodId: null,
      nameSnapshot: 'Test',
      amountG: 100,
      kcal: 100,
      origin: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ])
}

// 20:00 Berlin am 12.06.2026 (UTC+2): 18:00 UTC
const EVENING = new Date('2026-06-12T18:00:00Z')
const MORNING = new Date('2026-06-12T06:00:00Z')

describe('localDayAndTime', () => {
  it('formats date and time in the given zone', () => {
    expect(localDayAndTime(EVENING, TZ)).toEqual({ date: '2026-06-12', time: '20:00' })
  })
})

describe('runReminderTick', () => {
  it('sends once after the configured time when nothing is tracked', async () => {
    const db = createTestDb()
    await setupUser(db)
    const sent: string[] = []
    expect(await runReminderTick(db, { now: EVENING, send: fakeSender(sent) })).toBe(1)
    expect(sent).toHaveLength(1)
    // zweiter Tick am selben Tag: kein Doppelversand
    expect(await runReminderTick(db, { now: EVENING, send: fakeSender(sent) })).toBe(0)
    expect(sent).toHaveLength(1)
  })

  it('stays silent before the reminder time', async () => {
    const db = createTestDb()
    await setupUser(db)
    const sent: string[] = []
    expect(await runReminderTick(db, { now: MORNING, send: fakeSender(sent) })).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('stays silent when the user already tracked today', async () => {
    const db = createTestDb()
    const user = await setupUser(db)
    logEntry(db, user.id, '2026-06-12')
    const sent: string[] = []
    expect(await runReminderTick(db, { now: EVENING, send: fakeSender(sent) })).toBe(0)
  })

  it('skips users without opt-in', async () => {
    const db = createTestDb()
    const user = await createUser(db, 'silent', 'pw-123456')
    upsertToken(db, user.id, 'tok-silent-1234', 'ios')
    const sent: string[] = []
    expect(await runReminderTick(db, { now: EVENING, send: fakeSender(sent) })).toBe(0)
  })

  it('removes tokens that APNs reports as unregistered', async () => {
    const db = createTestDb()
    const user = await setupUser(db)
    const sent: string[] = []
    await runReminderTick(db, {
      now: EVENING,
      send: fakeSender(sent, { ok: false, status: 410, reason: 'Unregistered' }),
    })
    expect(listUserTokens(db, user.id)).toHaveLength(0)
  })
})
