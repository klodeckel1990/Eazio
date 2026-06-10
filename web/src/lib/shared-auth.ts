// Bridge to the native SharedAuth plugin: mirrors the bearer token into the
// iOS App Group (the home-screen widget calls the API itself) and pokes
// WidgetKit after diary writes. Everything is best-effort and a no-op on web.

import { isNativeApp } from './barcode'

interface SharedAuthPlugin {
  setToken(options: { token: string }): Promise<void>
  clearToken(): Promise<void>
  refreshWidgets(): Promise<void>
}

let cached: SharedAuthPlugin | null | undefined

async function plugin(): Promise<SharedAuthPlugin | null> {
  if (!isNativeApp()) return null
  if (cached !== undefined) return cached
  try {
    const { registerPlugin } = await import('@capacitor/core')
    cached = registerPlugin<SharedAuthPlugin>('SharedAuth')
  } catch (err) {
    console.log('[SharedAuth] core import failed:', err instanceof Error ? err.message : String(err))
    cached = null
  }
  return cached
}

// Note: the authoritative token mirror runs NATIVELY (MainViewController reads
// localStorage on launch/backgrounding and writes the keychain) — this JS push
// is best-effort for instant updates right after login/logout.
export async function pushTokenToWidgets(token: string | null): Promise<void> {
  const p = await plugin()
  if (!p) return
  try {
    if (token) await p.setToken({ token })
    else await p.clearToken()
  } catch (err) {
    console.log('[SharedAuth] token push failed:', err instanceof Error ? err.message : String(err))
  }
}

export function refreshWidgets(): void {
  void plugin().then((p) => p?.refreshWidgets().catch(() => {}))
}
