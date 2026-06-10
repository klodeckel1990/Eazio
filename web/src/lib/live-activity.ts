// Tagesbilanz-Live-Activity (Lock Screen + Dynamic Island): JS schickt nach
// jeder Tagebuch-Änderung die Tagessummen an den nativen
// LiveActivityController ('eazioActivity'-MessageHandler). Komplett lokal,
// kein APNs — die Activity startet mit dem ersten Log des Tages und wird bei
// jedem weiteren aktualisiert. Auf Web/Android ein No-op.

import type { DiaryDay } from '../api/types'
import { isNativeApp } from './barcode'
import { todayStr } from './dates'

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        eazioHealth?: { postMessage: (msg: unknown) => void }
        eazioActivity?: { postMessage: (msg: unknown) => void }
      }
    }
  }
}

const OPT_OUT_KEY = 'eazio.liveActivityOff'

export function liveActivityAvailable(): boolean {
  return isNativeApp() && !!window.webkit?.messageHandlers?.eazioActivity
}

export function liveActivityEnabled(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== '1'
  } catch {
    return true
  }
}

export function setLiveActivityEnabled(on: boolean): void {
  try {
    localStorage.setItem(OPT_OUT_KEY, on ? '0' : '1')
  } catch {
    return
  }
  if (!on) endLiveActivity()
}

export function endLiveActivity(): void {
  if (!liveActivityAvailable()) return
  try {
    window.webkit!.messageHandlers!.eazioActivity!.postMessage({ action: 'end' })
  } catch {
    /* Teardown — egal */
  }
}

/** Startet/aktualisiert die Activity mit den Summen des HEUTIGEN Tages.
 *  Erst ab dem ersten Eintrag — ein leerer Tag lohnt keinen Lock Screen. */
export function pushLiveActivity(day: DiaryDay): void {
  if (!liveActivityAvailable() || !liveActivityEnabled()) return
  if (day.date !== todayStr()) return
  if (day.totals.kcal <= 0 && day.water.totalMl <= 0) return
  try {
    window.webkit!.messageHandlers!.eazioActivity!.postMessage({
      action: 'update',
      date: day.date,
      kcalRemaining: day.remainingKcal,
      kcalTarget: day.goals.kcalTarget + (day.activity?.countedKcal ?? 0),
      kcalConsumed: Math.round(day.totals.kcal),
      protein: Math.round(day.totals.protein * 10) / 10,
      carbs: Math.round(day.totals.carbs * 10) / 10,
      fat: Math.round(day.totals.fat * 10) / 10,
      waterMl: day.water.totalMl,
      waterTargetMl: day.goals.waterMl,
      steps: day.activity?.steps ?? null,
      streak: day.streak.currentStreak,
    })
  } catch {
    /* nächster Refresh versucht es erneut */
  }
}
