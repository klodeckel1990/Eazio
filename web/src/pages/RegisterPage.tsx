import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { IconAlert } from '../components/icons'

function errorMessage(err: ApiError): string {
  if (err.status === 429) return 'Zu viele Versuche. Bitte später erneut probieren.'
  if (err.status === 400) {
    return 'Bitte gültige Daten eingeben (E-Mail korrekt, Passwort ≥ 8 Zeichen, Benutzername ≥ 3 Zeichen).'
  }
  switch (err.message) {
    case 'username_taken':
      return 'Dieser Benutzername ist bereits vergeben.'
    case 'email_taken':
      return 'Für diese E-Mail existiert bereits ein Konto.'
    default:
      return 'Registrierung fehlgeschlagen.'
  }
}

export function RegisterPage() {
  const { user, register, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register(username, email, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(errorMessage(err))
      } else {
        throw err
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={(e) => { void handleSubmit(e) }}>
        <div className="auth-brand">
          <img className="auth-logo" src="/icon-192.png" alt="" />
          <h1>Tellerwert</h1>
          <p>Erstelle dein Konto.</p>
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
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <span className="muted small">Mindestens 8 Zeichen.</span>
        </div>

        {error && (
          <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
        )}

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
          {submitting ? 'Konto wird erstellt…' : 'Konto erstellen'}
        </button>

        <p className="auth-alt">
          Schon ein Konto? <Link to="/login">Anmelden</Link>
        </p>
      </form>
    </div>
  )
}
