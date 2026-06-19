// Health-Brücke. Zwei native Kanäle, EIN JS-Vertrag:
//  - iOS: HealthSync.swift hängt einen eigenen WKScriptMessageHandler
//    'eazioHealth' an die WebView (bewusst nicht die Capacitor-Bridge, deren
//    Dispatch für handregistrierte Plugins auf iOS nie ankam) und antwortet
//    per CustomEvent 'eazio:health'.
//  - Android: das Capacitor-Plugin 'Health' (HealthPlugin.kt) liest Health
//    Connect und liefert dieselben Felder als Promise zurück — wir übersetzen
//    sie hier in genau dasselbe 'eazio:health'-Event.
// Dadurch bleiben Listener (initHealthSync), Server und DB plattformneutral.
// Auf Web ist alles ein No-op.

import { Capacitor, registerPlugin } from '@capacitor/core'
import { api } from '../api/client'
import { isNativeApp } from './barcode'
import { todayStr } from './dates'

interface HealthPayload {
  steps?: number
  activeKcal?: number
  weightKg?: number
  /** ISO timestamp of the weight sample (smart scale) */
  weightAt?: string
  error?: string
}

interface HealthWriteDay {
  date: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  waterMl: number
}

interface HealthPlugin {
  sync(): Promise<HealthPayload>
  writeDay(day: HealthWriteDay): Promise<void>
}

// Android-Plugin (nur dort registriert); auf iOS/Web bleibt es ungenutzt.
const AndroidHealth =
  Capacitor.getPlatform() === 'android' ? registerPlugin<HealthPlugin>('Health') : null

function iosHandler(): { postMessage: (m: unknown) => void } | null {
  return window.webkit?.messageHandlers?.eazioHealth ?? null
}

// window.webkit-Deklaration lebt zentral in lib/live-activity.ts

const OPT_IN_KEY = 'eazio.healthOptIn'

export function healthAvailable(): boolean {
  if (!isNativeApp()) return false
  if (iosHandler()) return true // iOS: nativer Handler hängt an der WebView
  return AndroidHealth !== null // Android: Capacitor-Plugin registriert
}

export function healthOptedIn(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === '1'
  } catch {
    return false // restricted storage (tests/private mode) — treat as off
  }
}

export function setHealthOptIn(on: boolean): void {
  try {
    localStorage.setItem(OPT_IN_KEY, on ? '1' : '0')
  } catch {
    return
  }
  if (on) requestHealthSync()
}

/** Asks native for fresh health data (triggers the permission sheet on first
 *  use). The response always arrives via the 'eazio:health' event. */
export function requestHealthSync(): void {
  if (!healthAvailable() || !healthOptedIn()) return
  const ios = iosHandler()
  if (ios) {
    try {
      ios.postMessage({ action: 'sync' })
    } catch {
      // handler vanished (webview teardown) — next foreground retries
    }
    return
  }
  // Android: Plugin liefert die Tageswerte als Promise → in dasselbe Event gießen
  AndroidHealth?.sync()
    .then((detail) => window.dispatchEvent(new CustomEvent('eazio:health', { detail })))
    .catch(() => {})
}

export interface HealthDayTotals {
  date: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  waterMl: number
}

/** Schreibt die Tagessummen nach Apple Health (Tages-Abgleich, idempotent).
 *  Zukunftstage werden übersprungen — HealthKit lehnt Future-Samples ab. */
export function pushDayToHealth(day: HealthDayTotals): void {
  if (!healthAvailable() || !healthOptedIn()) return
  if (day.date > todayStr()) return
  const payload: HealthWriteDay = {
    date: day.date,
    kcal: Math.round(day.kcal),
    protein: Math.round(day.protein * 10) / 10,
    fat: Math.round(day.fat * 10) / 10,
    carbs: Math.round(day.carbs * 10) / 10,
    waterMl: Math.round(day.waterMl),
  }
  const ios = iosHandler()
  if (ios) {
    try {
      ios.postMessage({ action: 'writeDay', ...payload })
    } catch {
      // handler weg (Teardown) — nächster Refresh gleicht ab
    }
    return
  }
  AndroidHealth?.writeDay(payload).catch(() => {})
}

let wired = false
/** Wire once at app start: pushes incoming HealthKit data to the server and
 *  notifies listeners (TrackerPage) to refresh the day. */
export function initHealthSync(onSynced?: () => void): void {
  if (wired || !isNativeApp()) return
  wired = true
  window.addEventListener('eazio:health', (e) => {
    const detail = (e as CustomEvent<HealthPayload>).detail
    if (!detail || detail.error) return
    const patch: { steps?: number; activeKcal?: number; weightKg?: number } = {}
    if (typeof detail.steps === 'number') patch.steps = Math.round(detail.steps)
    if (typeof detail.activeKcal === 'number') patch.activeKcal = Math.round(detail.activeKcal)
    // only sync scale weights from today/yesterday — an ancient sample must
    // not overwrite a manually maintained profile weight
    if (typeof detail.weightKg === 'number' && detail.weightAt) {
      const age = Date.now() - Date.parse(detail.weightAt)
      if (age >= 0 && age < 48 * 3600 * 1000) patch.weightKg = Math.round(detail.weightKg * 10) / 10
    }
    if (Object.keys(patch).length === 0) return
    api.activity.update(patch).then(() => onSynced?.()).catch(() => {})
  })
  // keep values fresh whenever the app comes to the foreground
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestHealthSync()
  })
  requestHealthSync()
}
