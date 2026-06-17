// Smarte Mahlzeiten-Erinnerungen: pro Slot (Frühstück/Mittag/Abend) lernt der
// Server aus den letzten 28 Tagen, WANN der Nutzer üblicherweise trackt
// (Median der Eintragszeit) und erinnert 45 Minuten danach, falls der Slot
// heute leer ist. Slots ohne Gewohnheit (< 5 Einträge) bekommen keine
// Erinnerung — wer nie frühstückt, wird morgens nicht genervt. Yazio-Importe
// zählen nicht (createdAt = Importzeitpunkt, nicht Essenszeit).
import { and, eq, gte, lt, ne } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import type { DB } from '../../db/client.js'
import { diaryEntries } from '../../db/schema.js'
import { pushLog } from '../../db/schema.js'
import { listDayEntries } from '../diary/diary.repo.js'
import { getStreak } from '../diary/streak.js'
import { getSettings } from '../settings/settings.repo.js'
import type { PushMessage } from './apns.js'
import { deliverToUser } from './deliver.js'
import { listUserIdsWithTokens } from './push.repo.js'
import { localDayAndTime, type FcmSender, type Sender } from './reminder-job.js'

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const
export type MealSlot = (typeof MEAL_SLOTS)[number]

const GRACE_MINUTES = 45
const HISTORY_DAYS = 28
const MIN_HISTORY_ENTRIES = 5
/** Mehr als zwei Mahlzeiten-Pushes pro Tag nerven nur. */
const DAILY_CAP = 2
/** Wer in den letzten 60 min getrackt hat, ist dran — nicht reinfunken. */
const ACTIVE_GRACE_MS = 60 * 60 * 1000

// Erinnerung frühestens/spätestens (Ziel wird geclampt); nach expiry ist der
// Zug abgefahren — ein Frühstücks-Push am Nachmittag wäre absurd.
const WINDOWS: Record<MealSlot, { earliest: string; latest: string; expiry: string }> = {
  breakfast: { earliest: '07:30', latest: '11:30', expiry: '12:30' },
  lunch: { earliest: '12:00', latest: '15:00', expiry: '16:30' },
  dinner: { earliest: '17:30', latest: '21:00', expiry: '22:00' },
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

function toHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

function localHHMM(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(epochMs))
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Typische Track-Uhrzeit (HH:MM) eines Slots — Median der letzten 28 Tage,
 *  null wenn der Nutzer den Slot nicht regelmäßig nutzt. */
export function typicalLogTime(
  db: DB,
  userId: string,
  slot: MealSlot,
  today: string,
  timeZone: string,
): string | null {
  const rows = db
    .select({ createdAt: diaryEntries.createdAt })
    .from(diaryEntries)
    .where(
      and(
        eq(diaryEntries.userId, userId),
        eq(diaryEntries.daytime, slot),
        gte(diaryEntries.date, shiftDate(today, -HISTORY_DAYS)),
        lt(diaryEntries.date, today),
        ne(diaryEntries.origin, 'yazio_import'),
      ),
    )
    .all()
  if (rows.length < MIN_HISTORY_ENTRIES) return null
  const minutes = rows.map((r) => toMinutes(localHHMM(r.createdAt, timeZone))).sort((a, b) => a - b)
  return toHHMM(minutes[Math.floor(minutes.length / 2)]!)
}

/** Geplante Erinnerungszeit: Median + 45 min, ins Slot-Fenster geclampt. */
export function mealReminderTarget(
  db: DB,
  userId: string,
  slot: MealSlot,
  today: string,
  timeZone: string,
): string | null {
  const typical = typicalLogTime(db, userId, slot, today, timeZone)
  if (!typical) return null
  const w = WINDOWS[slot]
  const target = toMinutes(typical) + GRACE_MINUTES
  return toHHMM(Math.min(Math.max(target, toMinutes(w.earliest)), toMinutes(w.latest)))
}

const SLOT_TEXTS: Record<MealSlot, { title: string; bodies: string[] }> = {
  breakfast: {
    title: 'Frühstück schon gehabt? ☕',
    bodies: [
      'Halt es fest, solange du es noch weißt — dauert 10 Sekunden.',
      'Dein Tagebuch wartet auf den ersten Eintrag des Tages.',
    ],
  },
  lunch: {
    title: 'Mittagessen tracken? 🥗',
    bodies: [
      'Kurz eintragen, dann ist der Kopf wieder frei.',
      'Um diese Zeit trackst du sonst dein Mittagessen.',
    ],
  },
  dinner: {
    title: 'Abendessen schon im Tagebuch? 🍽️',
    bodies: [
      'Noch schnell eintragen, dann ist der Tag komplett.',
      'Ein Eintrag noch und der Tag ist sauber dokumentiert.',
    ],
  },
}

export function mealMessage(slot: MealSlot, streak: number, date: string): PushMessage {
  const t = SLOT_TEXTS[slot]
  if (streak >= 3) {
    return { title: t.title, body: `Tag ${streak + 1} deiner Serie läuft — bleib dran! 🔥` }
  }
  // tagesstabile Variation statt Zufall: gleicher Tag → gleicher Text
  const variant = Number(date.slice(-2)) % t.bodies.length
  return { title: t.title, body: t.bodies[variant]! }
}

function sentSlotsToday(db: DB, userId: string, date: string): Set<string> {
  return new Set(
    db
      .select({ kind: pushLog.kind })
      .from(pushLog)
      .where(and(eq(pushLog.userId, userId), eq(pushLog.date, date)))
      .all()
      .map((r) => r.kind)
      // nur Mahlzeiten-Slots zählen zum Tageslimit — Wasser-Pushes sind separat
      .filter((k) => (MEAL_SLOTS as readonly string[]).includes(k)),
  )
}

export function markSlotSent(db: DB, userId: string, date: string, slot: MealSlot): void {
  db.insert(pushLog)
    .values({ userId, date, kind: slot, sentAt: Date.now() })
    .onConflictDoNothing()
    .run()
}

export async function runMealReminderTick(
  db: DB,
  opts: {
    now?: Date
    timeZone?: string
    send?: Sender
    sendFcm?: FcmSender
    log?: FastifyBaseLogger
  } = {},
): Promise<number> {
  const now = opts.now ?? new Date()
  const timeZone = opts.timeZone ?? 'Europe/Berlin'
  const { date, time } = localDayAndTime(now, timeZone)
  let sent = 0

  for (const userId of listUserIdsWithTokens(db)) {
    const settings = getSettings(db, userId)
    if (!settings.mealReminders) continue

    const entries = listDayEntries(db, userId, date)
    // gerade aktiv? Dann braucht es keinen Stups.
    if (entries.some((e) => now.getTime() - e.createdAt < ACTIVE_GRACE_MS)) continue

    const already = sentSlotsToday(db, userId, date)
    if (already.size >= DAILY_CAP) continue

    for (const slot of MEAL_SLOTS) {
      if (already.has(slot)) continue
      if (entries.some((e) => e.daytime === slot)) continue
      const w = WINDOWS[slot]
      if (time > w.expiry) continue
      const target = mealReminderTarget(db, userId, slot, date, timeZone)
      if (!target || time < target) continue

      const msg = mealMessage(slot, getStreak(db, userId).currentStreak, date)
      const delivered = await deliverToUser(db, userId, msg, {
        apns: opts.send,
        fcm: opts.sendFcm,
        log: opts.log,
      })
      // wie bei der Abend-Erinnerung: auch Fehlversuche abhaken, kein Minuten-Spam
      markSlotSent(db, userId, date, slot)
      if (delivered) sent++
      break // höchstens ein Mahlzeiten-Push pro Nutzer und Tick
    }
  }
  return sent
}
