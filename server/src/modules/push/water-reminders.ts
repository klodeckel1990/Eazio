// Wasser-Erinnerung: ab einer festen Uhrzeit (Default 16:00) bekommt jeder
// Nutzer mit aktivierter Wasser-Erinnerung genau einen Push, sofern das
// Tagesziel noch nicht erreicht ist. Getränke (ml-Lebensmittel) zählen über
// dayDrinkMl bereits mit. pushLog (kind='water') verhindert Doppelversand.
import { and, eq } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import type { DB } from '../../db/client.js'
import { pushLog } from '../../db/schema.js'
import { dayDrinkMl, dayWaterTotal } from '../diary/diary.repo.js'
import { getGoals } from '../goals/goals.repo.js'
import { getSettings } from '../settings/settings.repo.js'
import type { PushMessage } from './apns.js'
import { deliverToUser } from './deliver.js'
import { listUserIdsWithTokens } from './push.repo.js'
import { localDayAndTime, type FcmSender, type Sender } from './reminder-job.js'

/** Frühester Versandzeitpunkt (lokale TZ) — genug Tag übrig zum Nachtrinken. */
const WATER_REMINDER_TIME = '16:00'
const WATER_KIND = 'water'

export function waterMessage(currentMl: number, goalMl: number): PushMessage {
  return {
    title: 'Zeit für etwas Wasser 💧',
    body: `Erst ${currentMl.toLocaleString('de-DE')} von ${goalMl.toLocaleString('de-DE')} ml — gönn dir ein Glas.`,
  }
}

function waterSentToday(db: DB, userId: string, date: string): boolean {
  return (
    db
      .select({ kind: pushLog.kind })
      .from(pushLog)
      .where(and(eq(pushLog.userId, userId), eq(pushLog.date, date), eq(pushLog.kind, WATER_KIND)))
      .get() != null
  )
}

export function markWaterSent(db: DB, userId: string, date: string): void {
  db.insert(pushLog)
    .values({ userId, date, kind: WATER_KIND, sentAt: Date.now() })
    .onConflictDoNothing()
    .run()
}

export async function runWaterReminderTick(
  db: DB,
  opts: {
    now?: Date
    timeZone?: string
    send?: Sender
    sendFcm?: FcmSender
    log?: FastifyBaseLogger
  } = {},
): Promise<number> {
  const { date, time } = localDayAndTime(opts.now ?? new Date(), opts.timeZone ?? 'Europe/Berlin')
  let sent = 0
  for (const userId of listUserIdsWithTokens(db)) {
    const settings = getSettings(db, userId)
    if (!settings.waterReminders) continue
    if (time < WATER_REMINDER_TIME) continue
    if (waterSentToday(db, userId, date)) continue

    const goalMl = getGoals(db, userId).waterMl
    if (goalMl <= 0) continue
    const current = dayWaterTotal(db, userId, date) + dayDrinkMl(db, userId, date)
    if (current >= goalMl) continue

    const delivered = await deliverToUser(db, userId, waterMessage(current, goalMl), {
      apns: opts.send,
      fcm: opts.sendFcm,
      log: opts.log,
    })
    // wie bei den anderen Erinnerungen: auch Fehlversuche abhaken (kein Minuten-Spam)
    markWaterSent(db, userId, date)
    if (delivered) sent++
  }
  return sent
}
