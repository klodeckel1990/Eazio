// "Mit Apple/Google fortfahren" unter dem Login-/Registrier-Formular.
// Welche Buttons erscheinen, entscheidet der Server (oauth/config) plus die
// Plattform — ohne Konfiguration rendert die Komponente nichts.
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { availableProviders, isUserCancelled } from '../lib/social-login'
import type { SocialProvider } from '../api/types'
import { IconAlert } from './icons'

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z" />
      <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#FBBC05" d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z" />
    </svg>
  )
}

const LABELS: Record<SocialProvider, string> = {
  apple: 'Mit Apple fortfahren',
  google: 'Mit Google fortfahren',
}

export function SocialLoginButtons() {
  const { loginWithProvider } = useAuth()
  const [providers, setProviders] = useState<SocialProvider[]>([])
  const [busy, setBusy] = useState<SocialProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    availableProviders()
      .then((p) => { if (alive) setProviders(p) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (providers.length === 0) return null

  const handle = async (provider: SocialProvider) => {
    setError(null)
    setBusy(provider)
    try {
      await loginWithProvider(provider)
      // kein navigate nötig: die Auth-Seiten leiten bei gesetztem User um
    } catch (err) {
      if (!isUserCancelled(err)) {
        setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.')
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="auth-divider"><span>oder</span></div>
      {providers.includes('apple') && (
        <button
          type="button"
          className="btn btn-lg btn-block btn-social btn-social-apple"
          disabled={busy !== null}
          onClick={() => { void handle('apple') }}
        >
          <AppleLogo />
          {busy === 'apple' ? 'Anmelden…' : LABELS.apple}
        </button>
      )}
      {providers.includes('google') && (
        <button
          type="button"
          className="btn btn-lg btn-block btn-social btn-social-google"
          disabled={busy !== null}
          onClick={() => { void handle('google') }}
        >
          <GoogleLogo />
          {busy === 'google' ? 'Anmelden…' : LABELS.google}
        </button>
      )}
      {error && (
        <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
      )}
    </>
  )
}
