import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Account } from '../api/types'

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [label, setLabel] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadAccounts = () => {
    api.accounts.list()
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLinkError(null)
    setSubmitting(true)
    try {
      await api.accounts.link(label, username, password)
      setLabel('')
      setUsername('')
      setPassword('')
      loadAccounts()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setLinkError('Yazio-Login fehlgeschlagen')
      } else {
        throw err
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    await api.accounts.setDefault(id)
    loadAccounts()
  }

  const handleRemove = async (id: string) => {
    await api.accounts.remove(id)
    loadAccounts()
  }

  return (
    <div className="container">
      <h2>Konten</h2>

      {accounts === null ? (
        <p>Lade Konten…</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {accounts.map(acc => (
            <li key={acc.id} style={{ marginBottom: '0.75rem' }}>
              <strong>{acc.label}</strong>
              {' '}
              <span className="muted">({acc.yazioUsername})</span>
              {' '}
              {acc.isDefault && <span className="badge">Standard</span>}
              {!acc.isDefault && (
                <button
                  type="button"
                  onClick={() => { void handleSetDefault(acc.id) }}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Als Standard
                </button>
              )}
              <button
                type="button"
                onClick={() => { void handleRemove(acc.id) }}
                style={{ marginLeft: '0.5rem' }}
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Konto verknüpfen</h3>
      <form onSubmit={(e) => { void handleLink(e) }}>
        <div>
          <label htmlFor="link-label">Bezeichnung</label>
          <input
            id="link-label"
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="link-username">Benutzername (Yazio)</label>
          <input
            id="link-username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="link-password">Passwort</label>
          <input
            id="link-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        {linkError && <p className="error">{linkError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Verknüpfen…' : 'Verknüpfen'}
        </button>
      </form>
    </div>
  )
}
