// Push-Registrierung (nur native App). Das OS liefert das APNs-Token asynchron
// über das 'registration'-Event; wir reichen es an den Server weiter und
// merken es uns lokal, damit Logout/Deaktivieren genau dieses Token wieder
// abmelden kann. Dynamischer Import wie in barcode.ts — nichts davon landet
// im Web-Startpfad.
import { api } from '../api/client'
import { isNativeApp } from './barcode'
import { getPlatform } from './social-login'

const TOKEN_KEY = 'tellerwert.pushToken'

export function pushAvailable(): boolean {
  return isNativeApp()
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

async function registerWithOs(): Promise<string> {
  const { PushNotifications } = await import('@capacitor/push-notifications')
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('push registration timeout')), 15_000)
    void PushNotifications.addListener('registration', (t) => {
      clearTimeout(timeout)
      resolve(t.value)
    })
    void PushNotifications.addListener('registrationError', (err) => {
      clearTimeout(timeout)
      reject(new Error(err.error))
    })
    PushNotifications.register().catch(reject)
  })
}

/** Fragt die OS-Berechtigung an und registriert das Gerät beim Server.
 *  Liefert false, wenn der Nutzer Benachrichtigungen verweigert hat. */
export async function enablePush(): Promise<boolean> {
  if (!pushAvailable()) return false
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return false
  const token = await registerWithOs()
  await api.push.register(token, getPlatform() === 'android' ? 'android' : 'ios')
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // nur fürs spätere Abmelden relevant
  }
  return true
}

/** Meldet das Gerät serverseitig ab (Toggle aus / Logout). */
export async function disablePush(): Promise<void> {
  const token = storedToken()
  if (!token) return
  await api.push.unregister(token).catch(() => {})
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // best effort
  }
}

/** Beim App-Start: Registrierung still auffrischen, wenn die Erinnerung an
 *  ist und die Berechtigung schon erteilt wurde — APNs-Tokens können rotieren. */
export async function syncPushRegistration(): Promise<void> {
  if (!pushAvailable()) return
  try {
    const settings = await api.settings.get()
    if (!settings.reminderPush && !settings.mealReminders) return
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') return
    const token = await registerWithOs()
    await api.push.register(token, getPlatform() === 'android' ? 'android' : 'ios')
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // best effort
    }
  } catch (err) {
    console.log('[push] sync failed:', err instanceof Error ? err.message : String(err))
  }
}
