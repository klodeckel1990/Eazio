// Social Sign-In (Google/Apple) über @capgo/capacitor-social-login. Nativ
// öffnet das Plugin die OS-Dialoge (Credential Manager / AuthenticationServices),
// im Browser lädt es Google Identity Services bzw. Sign in with Apple JS.
// Ergebnis ist immer ein ID-Token, das der Server verifiziert und gegen die
// normale Bearer-Session eintauscht. Dynamische Imports halten das Plugin aus
// dem Web-Startpfad heraus (gleicher Stil wie barcode.ts).

import { api, API_BASE } from '../api/client'
import type { OAuthConfig, SocialProvider } from '../api/types'

interface CapacitorGlobal {
  Capacitor?: { getPlatform?: () => string }
}

export function getPlatform(): 'web' | 'ios' | 'android' {
  const p = (window as CapacitorGlobal).Capacitor?.getPlatform?.()
  return p === 'ios' || p === 'android' ? p : 'web'
}

// Rückweg des Web-Popup-Flows: Google leitet das Popup auf /login zurück
// (#id_token in der URL). Die Token-Übergabe ans Opener-Fenster macht der
// Plugin-Konstruktor — der läuft aber erst beim ersten Methodenaufruf.
// Deshalb hier anstoßen, sobald laut Plugin-State ein Flow aussteht.
if (getPlatform() === 'web') {
  try {
    if (localStorage.getItem('social_login_oauth_pending')) {
      void import('@capgo/capacitor-social-login').then(({ SocialLogin }) =>
        SocialLogin.initialize({}),
      )
    }
  } catch {
    // localStorage gesperrt (Private Mode) — dann gibt es auch keinen Flow
  }
}

let configPromise: Promise<OAuthConfig | null> | null = null

function loadConfig(): Promise<OAuthConfig | null> {
  configPromise ??= api.auth.oauthConfig().catch(() => null)
  return configPromise
}

/** Welche Buttons die Login-/Registrier-Seite zeigen soll (Apple zuerst). */
export async function availableProviders(): Promise<SocialProvider[]> {
  const cfg = await loadConfig()
  if (!cfg) return []
  const platform = getPlatform()
  const out: SocialProvider[] = []
  if (platform === 'ios') {
    out.push('apple') // natives "Sign in with Apple" braucht keine Client-ID
    if (cfg.google?.iosClientId) out.push('google')
  } else if (platform === 'android') {
    if (cfg.google?.webClientId) out.push('google')
  } else {
    if (cfg.apple.webClientId) out.push('apple')
    if (cfg.google?.webClientId) out.push('google')
  }
  return out
}

/** Vom Nutzer abgebrochene Dialoge sollen keinen Fehlerbanner auslösen. */
export function isUserCancelled(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /cancel|abgebrochen|dismiss|1001|popup.*closed|user closed/i.test(msg)
}

let initialized = false

export async function socialLogin(
  provider: SocialProvider,
): Promise<{ idToken: string; name: string | undefined }> {
  const cfg = await loadConfig()
  if (!cfg) throw new Error('social login config unavailable')
  const { SocialLogin } = await import('@capgo/capacitor-social-login')

  if (!initialized) {
    const platform = getPlatform()
    const init: Parameters<typeof SocialLogin.initialize>[0] = {}
    if (cfg.google?.webClientId || cfg.google?.iosClientId) {
      init.google = {
        webClientId: cfg.google.webClientId ?? undefined,
        iOSClientId: cfg.google.iosClientId ?? undefined,
        mode: 'online',
        // Feste, in der Google Console registrierte Redirect-URI für den
        // Popup-Flow im Browser — sonst hinge sie von der aktuellen Seite ab
        // (redirect_uri_mismatch auf /register).
        ...(platform === 'web'
          ? { redirectUrl: `${window.location.origin}/login` }
          : {}),
      }
    }
    if (platform === 'web') {
      // Web braucht die Apple Services ID + registrierte Redirect-URL.
      if (cfg.apple.webClientId) {
        init.apple = {
          clientId: cfg.apple.webClientId,
          redirectUrl: `${API_BASE || window.location.origin}/login`,
        }
      }
    } else if (platform === 'ios') {
      // iOS: natives "Sign in with Apple" braucht keine Konfiguration.
      // Android NICHT: dort bieten wir Apple gar nicht an, und das Plugin
      // bricht die ganze initialize() ab ("apple.android.redirectUrl is null
      // or empty"), sobald ein apple-Block dabei ist — dann startet auch der
      // Google-Login nie. Also auf Android nur Google initialisieren.
      init.apple = {}
    }
    await SocialLogin.initialize(init)
    initialized = true
  }

  const res = await SocialLogin.login(
    provider === 'apple'
      ? { provider: 'apple', options: { scopes: ['email', 'name'] } }
      : // Bei Google KEINE scopes übergeben: capgo verlangt für zusätzliche
        // Scopes einen Authorization-Flow mit MainActivity-Anpassung ("You
        // CANNOT use scopes without modifying the main activity"). Wir wollen
        // nur das ID-Token (enthält E-Mail + Name) — also Default-Scopes nutzen.
        { provider: 'google', options: {} },
  )
  const result = res.result as {
    idToken?: string | null
    profile?: { name?: string | null; givenName?: string | null; familyName?: string | null }
  }
  if (!result.idToken) throw new Error('provider returned no id token')
  // Apple liefert den Namen nur bei der allerersten Autorisierung — direkt an
  // den Server durchreichen, später kommt er nie wieder.
  const name =
    result.profile?.name?.trim() ||
    [result.profile?.givenName, result.profile?.familyName].filter(Boolean).join(' ').trim()
  return { idToken: result.idToken, name: name || undefined }
}
