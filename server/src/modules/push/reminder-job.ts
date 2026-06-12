// Abend-Erinnerung: ab der eingestellten Uhrzeit (Default 19:30) bekommt
// jeder Nutzer mit aktivierter Erinnerung und leerem Tagestagebuch genau
// einen Push — streak-bewusst formuliert. ">=" statt "==" macht den Job
// robust gegen verpasste Minuten (Neustart, Last); push_reminders verhindert
// Doppelversand.
import { and, eq } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import type { DB } from '../../db/client.js'
import { pushLog } from '../../db/schema.js'
import { listDayEntries } from '../diary/diary.repo.js'
import { getStreak } from '../diary/streak.js'
import { getSettings } from '../settings/settings.repo.js'
import { sendWithFallback, type PushMessage } from './apns.js'
import type { sendFcm } from './fcm.js'
import { anyPushConfigured, deliverToUser } from './deliver.js'
import { lastReminderDate, listUserIdsWithTokens, markReminderSent } from './push.repo.js'

export type Sender = typeof sendWithFallback
export type FcmSender = typeof sendFcm

/** Datum + Uhrzeit in der Server-Zeitzone (TZ, Europe/Berlin). */
export function localDayAndTime(now: Date, timeZone: string): { date: string; time: string } {
  // sv-SE formatiert als "YYYY-MM-DD HH:MM" — stabil parsebar ohne Lib
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  const [date, time] = s.split(' ')
  return { date: date!, time: time! }
}

function reminderMessage(streak: number): PushMessage {
  if (streak >= 2) {
    return {
      title: 'Deine Serie ist in Gefahr 🔥',
      body: `${streak} Tage am Stück getrackt — heute fehlt noch ein Eintrag.`,
    }
  }
  return { title: 'Kurz eintragen? 🌱', body: 'Du hast heute noch nichts getrackt.' }
}

export async function runReminderTick(
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
    if (!settings.reminderPush) continue
    if (time < settings.reminderTime) continue
    if (lastReminderDate(db, userId) === date) continue
    if (listDayEntries(db, userId, date).length > 0) continue
    // Heute schon per Mahlzeiten-Erinnerung gestupst? Dann wäre der
    // Abend-Push derselbe Appell in grün — auslassen.
    const nudgedToday = db
      .select({ kind: pushLog.kind })
      .from(pushLog)
      .where(and(eq(pushLog.userId, userId), eq(pushLog.date, date)))
      .all()
    if (nudgedToday.length > 0) continue

    const msg = reminderMessage(getStreak(db, userId).currentStreak)
    const delivered = await deliverToUser(db, userId, msg, {
      apns: opts.send,
      fcm: opts.sendFcm,
      log: opts.log,
    })
    // Auch ohne Zustellung als erledigt markieren: tote Tokens sollen nicht
    // jede Minute neue Versuche auslösen; beim nächsten App-Start kommt ein
    // frisches Token.
    markReminderSent(db, userId, date)
    if (delivered) sent++
  }
  return sent
}

export function startReminderJob(db: DB, log: FastifyBaseLogger): void {
  if (!anyPushConfigured()) {
    log.info('push: weder APNs noch FCM konfiguriert — Erinnerungs-Job inaktiv')
    return
  }
  setInterval(() => {
    void (async () => {
      // Mahlzeiten zuerst — die Abend-Erinnerung sieht deren push_log und
      // hält dann die Klappe.
      const { runMealReminderTick } = await import('./meal-reminders.js')
      await runMealReminderTick(db, { log })
      await runReminderTick(db, { log })
    })().catch((err) => log.error({ err }, 'reminder tick failed'))
  }, 60_000)
  log.info('push: Erinnerungs-Job läuft (Tick 60s)')
}
