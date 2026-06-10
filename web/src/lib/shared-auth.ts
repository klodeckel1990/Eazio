// Bridge to the native SharedAuth plugin: mirrors the bearer token into the
// iOS App Group (the home-screen widget calls the API itself) and pokes
// WidgetKit after diary writes. Everything is best-effort and a no-op on web.

import { isNativeApp } from './barcode'

interface SharedAuthPlugin {
  setToken(options: { token: string }): Promise<void>
  clearToken(): Promise<void>
  refreshWidgets(): Promise<void>
}

async function plugin(): Promise<SharedAuthPlugin | null> {
  if (!isNativeApp()) return null
  try {
    const { registerPlugin } = await import('@capacitor/core')
    return registerPlugin<SharedAuthPlugin>('SharedAuth')
  } catch {
    return null
  }
}

export async function pushTokenToWidgets(token: string | null): Promise<void> {
  const p = await plugin()
  if (!p) return
  try {
    if (token) await p.setToken({ token })
    else await p.clearToken()
  } catch {
    // older native shell without the plugin — ignore
  }
}

export function refreshWidgets(): void {
  void plugin().then((p) => p?.refreshWidgets().catch(() => {}))
}
