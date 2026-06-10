// Apple-Health-Brücke: Die native Seite (HealthSync.swift) hängt einen eigenen
// WKScriptMessageHandler 'eazioHealth' an die WebView — bewusst NICHT der
// Capacitor-Plugin-Bridge (deren Dispatch für handregistrierte Plugins in
// dieser App nie ankam). JS fordert einen Sync an; native fragt HealthKit ab
// und antwortet per CustomEvent 'eazio:health' mit Tageswerten + Gewicht.
// Auf Web/Android ist alles ein No-op.

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

declare global {
  interface Window {
    webkit?: { messageHandlers?: { eazioHealth?: { postMessage: (msg: unknown) => void } } }
  }
}

const OPT_IN_KEY = 'eazio.healthOptIn'

export function healthAvailable(): boolean {
  return isNativeApp() && !!window.webkit?.messageHandlers?.eazioHealth
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

/** Asks native for fresh HealthKit data (triggers the permission sheet on
 *  first use). The response arrives via the 'eazio:health' event. */
export function requestHealthSync(): void {
  if (!healthAvailable() || !healthOptedIn()) return
  try {
    window.webkit!.messageHandlers!.eazioHealth!.postMessage({ action: 'sync' })
  } catch {
    // handler vanished (webview teardown) — next foreground retries
  }
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
  try {
    window.webkit!.messageHandlers!.eazioHealth!.postMessage({
      action: 'writeDay',
      date: day.date,
      kcal: Math.round(day.kcal),
      protein: Math.round(day.protein * 10) / 10,
      fat: Math.round(day.fat * 10) / 10,
      carbs: Math.round(day.carbs * 10) / 10,
      waterMl: Math.round(day.waterMl),
    })
  } catch {
    // handler weg (Teardown) — nächster Refresh gleicht ab
  }
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
