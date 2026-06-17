import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { IconAlert, IconCheckCircle } from '../components/icons'
import { SocialLoginButtons } from '../components/SocialLoginButtons'

export function LoginPage() {
  const { user, login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // „Passwort vergessen?"
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  if (loading) return null
  if (user) return <Navigate to={from} replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError('Anmeldung fehlgeschlagen')
      } else {
        // network/TLS/CORS failures land here — never swallow them silently
        setError('Server nicht erreichbar. Bitte Verbindung prüfen.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    setForgotBusy(true)
    try {
      await api.auth.forgotPassword(forgotEmail.trim())
      setForgotSent(true)
    } catch (err) {
      // Der Server antwortet immer 200 (keine Existenz-Preisgabe); nur echte
      // Netzwerkfehler hier melden.
      if (err instanceof ApiError) setForgotSent(true)
      else setForgotError('Server nicht erreichbar. Bitte Verbindung prüfen.')
    } finally {
      setForgotBusy(false)
    }
  }

  const backToLogin = () => { setForgotMode(false); setForgotSent(false); setForgotError(null) }

  if (forgotMode) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-brand">
            <img className="auth-logo" src="/icon-192.png" alt="" />
            <h1>Passwort vergessen</h1>
          </div>
          {forgotSent ? (
            <>
              <p className="banner success">
                <IconCheckCircle />
                <span className="banner-text">
                  Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum
                  Zurücksetzen geschickt. Schau ggf. auch im Spam nach.
                </span>
              </p>
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={backToLogin}>
                Zurück zum Login
              </button>
            </>
          ) : (
            <form onSubmit={(e) => { void handleForgot(e) }}>
              <p>Gib die E-Mail-Adresse deines Kontos ein — wir senden dir einen Link, um ein neues Passwort zu setzen (30 Min gültig).</p>
              <div className="field">
                <label htmlFor="forgot-email">E-Mail</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoFocus
                  required
                />
              </div>
              {forgotError && (
                <p className="banner error"><IconAlert /><span className="banner-text">{forgotError}</span></p>
              )}
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={forgotBusy || !forgotEmail.trim()}>
                {forgotBusy ? 'Senden…' : 'Reset-Link senden'}
              </button>
              <p className="auth-alt">
                <button type="button" className="auth-linkbtn" onClick={backToLogin}>Zurück zum Login</button>
              </p>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={(e) => { void handleSubmit(e) }}>
        <div className="auth-brand">
          <img className="auth-logo" src="/icon-192.png" alt="" />
          <h1>Tellerwert</h1>
          <p>Dein entspanntes Ernährungstagebuch.</p>
        </div>

        <div className="field">
          <label htmlFor="username">Benutzername</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button type="button" className="auth-linkbtn auth-forgot" onClick={() => setForgotMode(true)}>
          Passwort vergessen?
        </button>

        {error && (
          <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
        )}

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
          {submitting ? 'Anmelden…' : 'Anmelden'}
        </button>

        <SocialLoginButtons />

        <p className="auth-alt">
          Noch kein Konto? <Link to="/register">Registrieren</Link>
        </p>
      </form>
    </div>
  )
}
