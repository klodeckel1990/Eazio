import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { Account, ShoppingListFormat } from '../api/types'
import { IconUser, IconStar, IconTrash, IconPlus, IconAlert, IconShare, IconCheck, IconCart } from '../components/icons'

const FORMAT_OPTIONS: { value: ShoppingListFormat; title: string; desc: string }[] = [
  { value: 'plain', title: 'Klartext', desc: 'Einfache Liste – ideal für WhatsApp & Notizen.' },
  { value: 'checklist', title: 'Abhakbare Liste', desc: 'Mit ☐ zum Abhaken (iOS-Notizen, WhatsApp).' },
  { value: 'bring', title: 'Bring!', desc: 'Direkt in die Bring!-Einkaufsliste übernehmen.' },
]

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [label, setLabel] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [hintReenabled, setHintReenabled] = useState(false)
  const [format, setFormat] = useState<ShoppingListFormat | null>(null)

  const loadAccounts = () => {
    api.accounts.list()
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }

  useEffect(() => {
    loadAccounts()
    api.settings.get().then((s) => setFormat(s.shoppingListFormat)).catch(() => {})
  }, [])

  const selectFormat = (next: ShoppingListFormat) => {
    setFormat(next)
    api.settings.update({ shoppingListFormat: next }).catch(() => {})
  }

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

  const reenableHint = async () => {
    try {
      await api.settings.update({ iosShortcutHintDismissed: false })
      setHintReenabled(true)
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Einstellungen</h1>
        <span className="sub">Yazio-Konten, App-Optionen und mehr.</span>
      </header>

      <h2 className="section-title">Yazio-Konten</h2>

      {accounts === null ? (
        <p className="loading-inline"><span className="spinner" /> Lade Konten…</p>
      ) : accounts.length === 0 ? (
        <div className="empty">
          <span className="emoji"><IconUser /></span>
          <h3>Noch kein Konto</h3>
          <p>Verknüpfe unten dein Yazio-Konto, um Mahlzeiten zu tracken.</p>
        </div>
      ) : (
        <ul className="list">
          {accounts.map(acc => (
            <li key={acc.id}>
              <div className="row-card">
                <span className="row-icon"><IconUser /></span>
                <div className="row-main">
                  <div className="row-title">
                    <span className="text">{acc.label}</span>
                    {acc.isDefault && (
                      <span className="badge"><IconStar /> Standard</span>
                    )}
                  </div>
                  <div className="row-sub">{acc.yazioUsername}</div>
                </div>
                <div className="row-actions">
                  {!acc.isDefault && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => { void handleSetDefault(acc.id) }}
                    >
                      Als Standard
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-icon btn-danger"
                    onClick={() => { void handleRemove(acc.id) }}
                    aria-label={`${acc.label} entfernen`}
                    title="Entfernen"
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="card pad-lg">
        <h2 className="section-title">Konto verknüpfen</h2>
        <form className="stack" style={{ marginTop: '0.6rem' }} onSubmit={(e) => { void handleLink(e) }}>
          <div className="field">
            <label htmlFor="link-label">Bezeichnung</label>
            <input
              id="link-label"
              type="text"
              placeholder="z. B. Mein Konto"
              value={label}
              onChange={e => setLabel(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="link-username">Benutzername (Yazio)</label>
            <input
              id="link-username"
              type="text"
              placeholder="E-Mail bei Yazio"
              autoCapitalize="none"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="link-password">Passwort</label>
            <input
              id="link-password"
              type="password"
              placeholder="Yazio-Passwort"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {linkError && (
            <p className="banner error"><IconAlert /><span className="banner-text">{linkError}</span></p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            <IconPlus />
            {submitting ? 'Verknüpfen…' : 'Verknüpfen'}
          </button>
        </form>
      </div>

      <div className="card stack">
        <h2 className="section-title">Teilen &amp; Import</h2>
        <p className="muted">
          Blende die Anleitung zum Teilen aus Instagram (iPhone-Kurzbefehl) auf der Rezepte-Seite wieder ein.
        </p>
        {hintReenabled ? (
          <p className="banner success">
            <IconCheck />
            <span className="banner-text">Wird auf der Rezepte-Seite (am iPhone) wieder angezeigt.</span>
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => { void reenableHint() }}
          >
            <IconShare /> Teilen-Anleitung erneut anzeigen
          </button>
        )}
      </div>

      <div className="card stack">
        <h2 className="section-title"><IconCart /> Einkaufsliste</h2>
        <p className="muted">
          Format, in dem die Zutaten eines Rezepts für die Einkaufsliste kopiert werden.
        </p>
        <div className="opt-list" role="radiogroup" aria-label="Einkaufslisten-Format">
          {FORMAT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={format === o.value}
              className={`opt ${format === o.value ? 'is-active' : ''}`}
              onClick={() => selectFormat(o.value)}
            >
              <span className="opt-main">
                <span className="opt-title">{o.title}</span>
                <span className="opt-desc">{o.desc}</span>
              </span>
              {format === o.value && <IconCheck />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
