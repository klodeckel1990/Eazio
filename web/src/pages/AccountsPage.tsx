import { useEffect, useState } from 'react'
import { healthAvailable, healthOptedIn, setHealthOptIn } from '../lib/health'
import { liveActivityAvailable, liveActivityEnabled, setLiveActivityEnabled } from '../lib/live-activity'
import { api, ApiError } from '../api/client'
import type { Account, Goals, ShoppingListFormat } from '../api/types'
import { IconUser, IconStar, IconTrash, IconPlus, IconAlert, IconShare, IconCheck, IconCart } from '../components/icons'

const FORMAT_OPTIONS: { value: ShoppingListFormat; title: string; desc: string }[] = [
  { value: 'plain', title: 'Klartext', desc: 'Einfache Liste – ideal für WhatsApp & Notizen.' },
  { value: 'checklist', title: 'Abhakbare Liste', desc: 'Saubere Zeilen für Apple Notes – einfügen, markieren, Checklisten-Button tippen.' },
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
  const [goals, setGoals] = useState<Goals | null>(null)
  const [goalsSaved, setGoalsSaved] = useState(false)
  const [mirror, setMirror] = useState<boolean | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [healthOn, setHealthOn] = useState(healthOptedIn())
  const [liveActivityOn, setLiveActivityOn] = useState(liveActivityEnabled())
  const [activityBudget, setActivityBudget] = useState<boolean | null>(null)

  const loadAccounts = () => {
    api.accounts.list()
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }

  useEffect(() => {
    loadAccounts()
    api.settings.get().then((s) => { setFormat(s.shoppingListFormat); setMirror(s.mirrorToYazio); setActivityBudget(s.activityBudget) }).catch(() => {})
    api.goals.get().then(setGoals).catch(() => {})
  }, [])

  const selectFormat = (next: ShoppingListFormat) => {
    setFormat(next)
    api.settings.update({ shoppingListFormat: next }).catch(() => {})
  }

  const toggleMirror = () => {
    if (mirror === null) return
    const next = !mirror
    setMirror(next)
    api.settings.update({ mirrorToYazio: next }).catch(() => {})
  }

  const toggleHealth = () => {
    const next = !healthOn
    setHealthOn(next)
    setHealthOptIn(next) // on: triggert sofort Permission-Sheet + ersten Sync
  }

  const toggleLiveActivity = () => {
    const next = !liveActivityOn
    setLiveActivityOn(next)
    setLiveActivityEnabled(next)
  }

  const toggleActivityBudget = () => {
    if (activityBudget === null) return
    const next = !activityBudget
    setActivityBudget(next)
    api.settings.update({ activityBudget: next }).catch(() => {})
  }

  const importHistory = async () => {
    const account = accounts?.find((a) => a.isDefault) ?? accounts?.[0]
    if (!account || importing) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await api.accounts.importHistory(account.id, 90)
      setImportResult(
        res.entriesImported > 0
          ? `${res.entriesImported} Einträge aus ${res.daysScanned} Tagen importiert.`
          : res.daysSkipped > 0
            ? 'Alles schon da — keine neuen Einträge.'
            : 'Keine Yazio-Einträge im Zeitraum gefunden.',
      )
    } catch (err) {
      if (err instanceof ApiError) {
        setImportResult(err.status === 429 ? 'Zu viele Versuche — kurz warten.' : 'Import fehlgeschlagen.')
      } else {
        throw err
      }
    } finally {
      setImporting(false)
    }
  }

  const saveGoals = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!goals) return
    setGoalsSaved(false)
    try {
      setGoals(await api.goals.update({
        kcalTarget: goals.kcalTarget,
        waterMl: goals.waterMl,
        proteinG: goals.proteinG,
      }))
      setGoalsSaved(true)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
    }
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

      {goals && (
        <div className="card pad-lg">
          <h2 className="section-title">Tagesziele</h2>
          <button
            type="button"
            className="btn btn-soft btn-block"
            style={{ marginTop: '0.6rem' }}
            onClick={() => window.dispatchEvent(new CustomEvent('tellerwert:edit-profile', { detail: goals }))}
          >
            Profil-Assistent öffnen (Plan neu berechnen)
          </button>
          <form className="stack" style={{ marginTop: '0.6rem' }} onSubmit={(e) => { void saveGoals(e) }}>
            <div className="field">
              <label htmlFor="goal-kcal">Kalorienziel (kcal/Tag)</label>
              <input
                id="goal-kcal"
                type="number"
                inputMode="numeric"
                min={800}
                max={10000}
                value={goals.kcalTarget}
                onChange={(e) => setGoals({ ...goals, kcalTarget: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label htmlFor="goal-water">Wasserziel (ml/Tag)</label>
              <input
                id="goal-water"
                type="number"
                inputMode="numeric"
                min={0}
                max={10000}
                step={250}
                value={goals.waterMl}
                onChange={(e) => setGoals({ ...goals, waterMl: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label htmlFor="goal-protein">Proteinziel (g/Tag, optional)</label>
              <input
                id="goal-protein"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                value={goals.proteinG ?? ''}
                placeholder="–"
                onChange={(e) => setGoals({ ...goals, proteinG: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            {goalsSaved && (
              <p className="banner success"><IconCheck /><span className="banner-text">Ziele gespeichert.</span></p>
            )}
            <button type="submit" className="btn btn-primary btn-block">Ziele speichern</button>
          </form>
        </div>
      )}

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

      {healthAvailable() && (
        <>
          <div className="card water-card">
            <div>
              <strong>Apple Health</strong>
              <p className="muted" style={{ margin: 0 }}>
                Schritte, Aktivität und Gewicht lesen — Mahlzeiten und Wasser zurückschreiben.
              </p>
            </div>
            <button
              type="button"
              className={healthOn ? 'btn btn-primary btn-sm' : 'btn btn-soft btn-sm'}
              aria-pressed={healthOn}
              onClick={toggleHealth}
            >
              {healthOn ? 'An' : 'Aus'}
            </button>
          </div>
          {healthOn && activityBudget !== null && (
            <div className="card water-card">
              <div>
                <strong>Aktivität aufs Budget anrechnen</strong>
                <p className="muted" style={{ margin: 0 }}>
                  Verbrannte Aktivitätskalorien erhöhen dein Tagesbudget.
                </p>
              </div>
              <button
                type="button"
                className={activityBudget ? 'btn btn-primary btn-sm' : 'btn btn-soft btn-sm'}
                aria-pressed={activityBudget}
                onClick={toggleActivityBudget}
              >
                {activityBudget ? 'An' : 'Aus'}
              </button>
            </div>
          )}
        </>
      )}

      {liveActivityAvailable() && (
        <div className="card water-card">
          <div>
            <strong>Live Activity</strong>
            <p className="muted" style={{ margin: 0 }}>
              Tagesbilanz auf Sperrbildschirm und Dynamic Island, aktualisiert bei jedem Log.
            </p>
          </div>
          <button
            type="button"
            className={liveActivityOn ? 'btn btn-primary btn-sm' : 'btn btn-soft btn-sm'}
            aria-pressed={liveActivityOn}
            onClick={toggleLiveActivity}
          >
            {liveActivityOn ? 'An' : 'Aus'}
          </button>
        </div>
      )}

      {accounts !== null && accounts.length > 0 && mirror !== null && (
        <div className="card water-card">
          <div>
            <strong>Zu Yazio spiegeln</strong>
            <p className="muted" style={{ margin: 0 }}>
              Geloggte Einträge zusätzlich in dein verknüpftes Yazio-Konto schreiben.
            </p>
          </div>
          <button
            type="button"
            className={mirror ? 'btn btn-primary btn-sm' : 'btn btn-soft btn-sm'}
            aria-pressed={mirror}
            onClick={toggleMirror}
          >
            {mirror ? 'An' : 'Aus'}
          </button>
        </div>
      )}

      {accounts !== null && accounts.length > 0 && (
        <div className="card stack">
          <div>
            <strong>Yazio-Verlauf importieren</strong>
            <p className="muted" style={{ margin: 0 }}>
              Holt die letzten 90 Tage aus deinem Yazio-Konto ins Tagebuch — bereits importierte Tage
              werden übersprungen. Kann eine Minute dauern.
            </p>
          </div>
          {importResult && (
            <p className="banner success"><IconCheck /><span className="banner-text">{importResult}</span></p>
          )}
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => { void importHistory() }}
            disabled={importing}
          >
            {importing ? <><span className="spinner" /> Importiere…</> : 'Verlauf importieren'}
          </button>
        </div>
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
