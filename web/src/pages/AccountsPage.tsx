import { useEffect, useState, type ReactNode } from 'react'
import { healthAvailable, healthOptedIn, setHealthOptIn } from '../lib/health'
import { liveActivityAvailable, liveActivityEnabled, setLiveActivityEnabled } from '../lib/live-activity'
import { disablePush, enablePush, pushAvailable } from '../lib/push'
import { setThemePref, themePref, type ThemePref } from '../lib/theme'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PaywallSheet } from '../components/PaywallSheet'
import { getPlatform } from '../lib/social-login'
import type { Account, Goals, ShoppingListFormat } from '../api/types'
import { IconUser, IconStar, IconTrash, IconPlus, IconAlert, IconCheck, IconCart, IconTarget, IconMoon, IconHeart, IconChevronLeft, IconChevronRight, IconSettings, IconLogout } from '../components/icons'

const LEGAL_BASE = 'https://tellerwert.de'

type Section = 'profile' | 'appearance' | 'health' | 'yazio' | 'shopping' | 'premium' | 'account'

const SECTION_TITLES: Record<Section, string> = {
  profile: 'Profil & Ziele',
  appearance: 'Darstellung',
  health: 'Erinnerungen & Gesundheit',
  yazio: 'Yazio',
  shopping: 'Einkaufsliste',
  premium: 'Tellerwert Premium',
  account: 'Konto & Rechtliches',
}

const FORMAT_OPTIONS: { value: ShoppingListFormat; title: string; desc: string }[] = [
  { value: 'plain', title: 'Klartext', desc: 'Einfache Liste – ideal für WhatsApp & Notizen.' },
  { value: 'checklist', title: 'Abhakbare Liste', desc: 'Saubere Zeilen für Apple Notes – einfügen, markieren, Checklisten-Button tippen.' },
  { value: 'bring', title: 'Bring!', desc: 'Direkt in die Bring!-Einkaufsliste übernehmen.' },
]

const MANAGE_SUB_URL: Record<string, string> = {
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
}

export function AccountsPage() {
  const { deleteAccount, logout, premium, user } = useAuth()
  const [paywall, setPaywall] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [label, setLabel] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [format, setFormat] = useState<ShoppingListFormat | null>(null)
  const [goals, setGoals] = useState<Goals | null>(null)
  const [goalsSaved, setGoalsSaved] = useState(false)
  const [mirror, setMirror] = useState<boolean | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [healthOn, setHealthOn] = useState(healthOptedIn())
  const [liveActivityOn, setLiveActivityOn] = useState(liveActivityEnabled())
  const [theme, setTheme] = useState<ThemePref>(themePref())
  const [activityBudget, setActivityBudget] = useState<boolean | null>(null)
  const [reminderOn, setReminderOn] = useState<boolean | null>(null)
  const [reminderTime, setReminderTime] = useState('19:30')
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [mealRemindersOn, setMealRemindersOn] = useState<boolean | null>(null)
  const [section, setSection] = useState<Section | null>(null)

  const loadAccounts = () => {
    api.accounts.list()
      .then(setAccounts)
      .catch(() => setAccounts([]))
  }

  useEffect(() => {
    loadAccounts()
    api.settings.get().then((s) => {
      setFormat(s.shoppingListFormat)
      setMirror(s.mirrorToYazio)
      setActivityBudget(s.activityBudget)
      setReminderOn(s.reminderPush)
      setReminderTime(s.reminderTime)
      setMealRemindersOn(s.mealReminders)
    }).catch(() => {})
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

  const selectTheme = (pref: ThemePref) => {
    setTheme(pref)
    setThemePref(pref)
  }

  const toggleLiveActivity = () => {
    const next = !liveActivityOn
    setLiveActivityOn(next)
    setLiveActivityEnabled(next)
  }

  const toggleReminder = async () => {
    if (reminderOn === null) return
    setReminderError(null)
    if (reminderOn) {
      setReminderOn(false)
      await disablePush()
      api.settings.update({ reminderPush: false }).catch(() => {})
      return
    }
    try {
      if (!(await enablePush())) {
        setReminderError('Benachrichtigungen sind in den iOS-Einstellungen deaktiviert.')
        return
      }
      setReminderOn(true)
      api.settings.update({ reminderPush: true, reminderTime }).catch(() => {})
    } catch {
      setReminderError('Registrierung fehlgeschlagen. Bitte erneut versuchen.')
    }
  }

  const toggleMealReminders = async () => {
    if (mealRemindersOn === null) return
    setReminderError(null)
    if (mealRemindersOn) {
      setMealRemindersOn(false)
      api.settings.update({ mealReminders: false }).catch(() => {})
      // Token bleibt registriert, falls die Abend-Erinnerung noch an ist
      if (!reminderOn) await disablePush()
      return
    }
    try {
      if (!(await enablePush())) {
        setReminderError('Benachrichtigungen sind in den iOS-Einstellungen deaktiviert.')
        return
      }
      setMealRemindersOn(true)
      api.settings.update({ mealReminders: true }).catch(() => {})
    } catch {
      setReminderError('Registrierung fehlgeschlagen. Bitte erneut versuchen.')
    }
  }

  const changeReminderTime = (next: string) => {
    setReminderTime(next)
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(next)) {
      api.settings.update({ reminderTime: next }).catch(() => {})
    }
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

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      // Bei Erfolg setzt deleteAccount() user=null → die App springt zum Login.
      await deleteAccount()
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError('Löschen fehlgeschlagen. Bitte erneut versuchen.')
        setDeleting(false)
      } else {
        throw err
      }
    }
  }

  const themeLabel = theme === 'dark' ? 'Dunkel' : theme === 'light' ? 'Hell' : 'System'
  const formatLabel = FORMAT_OPTIONS.find((o) => o.value === format)?.title ?? '—'
  const yazioSub =
    accounts === null ? 'Wird geladen…'
      : accounts.length === 0 ? 'Nicht verknüpft'
        : `${accounts.length} ${accounts.length === 1 ? 'Konto' : 'Konten'} verknüpft`
  const premiumSub = premium
    ? (user?.premiumUntil ? `Aktiv bis ${new Date(user.premiumUntil).toLocaleDateString('de-DE')}` : 'Aktiv')
    : 'Frei – Upgrade möglich'
  const healthVisible = healthAvailable() || liveActivityAvailable() || pushAvailable()

  const MENU: { key: Section; title: string; sub: string; icon: ReactNode; tint: string; show: boolean }[] = [
    { key: 'profile', title: 'Profil & Ziele', sub: 'Kalorien-, Wasser- & Proteinziel', icon: <IconTarget />, tint: 's-green', show: true },
    { key: 'appearance', title: 'Darstellung', sub: themeLabel, icon: <IconMoon />, tint: 's-neutral', show: true },
    { key: 'health', title: 'Erinnerungen & Gesundheit', sub: 'Push, Apple Health, Live Activity', icon: <IconHeart />, tint: 's-rose', show: healthVisible },
    { key: 'yazio', title: 'Yazio', sub: yazioSub, icon: <IconUser />, tint: 's-teal', show: true },
    { key: 'shopping', title: 'Einkaufsliste', sub: formatLabel, icon: <IconCart />, tint: 's-amber', show: true },
    { key: 'premium', title: 'Tellerwert Premium', sub: premiumSub, icon: <IconStar />, tint: 's-green', show: true },
    { key: 'account', title: 'Konto & Rechtliches', sub: 'Datenschutz, Impressum, Konto löschen', icon: <IconSettings />, tint: 's-neutral', show: true },
  ]

  return (
    <div className="page">
      {section ? (
        <header className="page-head settings-subhead">
          <button type="button" className="btn btn-ghost btn-sm settings-back" onClick={() => setSection(null)}>
            <IconChevronLeft /> Einstellungen
          </button>
          <h1>{SECTION_TITLES[section]}</h1>
        </header>
      ) : (
        <>
          <header className="page-head">
            <h1>Einstellungen</h1>
            <span className="sub">Profil, App und Verknüpfungen.</span>
          </header>
          <div className="stack settings-menu">
            {MENU.filter((m) => m.show).map((m) => (
              <button key={m.key} type="button" className="add-option" onClick={() => setSection(m.key)}>
                <span className={`add-option-ico ${m.tint}`}>{m.icon}</span>
                <span className="add-option-text"><strong>{m.title}</strong><span>{m.sub}</span></span>
                <IconChevronRight className="add-option-chev" />
              </button>
            ))}
          </div>
        </>
      )}

      {section === 'profile' && (
        <>
      {goals && (
        <div className="card pad-lg stack">
          <button
            type="button"
            className="btn btn-soft btn-block"
            onClick={() => window.dispatchEvent(new CustomEvent('tellerwert:edit-profile', { detail: goals }))}
          >
            Profil-Assistent öffnen (Plan neu berechnen)
          </button>
          <form className="stack" onSubmit={(e) => { void saveGoals(e) }}>
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

        </>
      )}

      {section === 'appearance' && (
        <>
      <div className="card stack">
        <p className="muted">Hell, Dunkel oder automatisch dem System folgen.</p>
        <div className="seg" role="group" aria-label="Erscheinungsbild">
          {([['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']] as [ThemePref, string][]).map(([value, lbl]) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => selectTheme(value)}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

        </>
      )}

      {section === 'health' && (
        <>
      {(healthAvailable() || liveActivityAvailable() || pushAvailable()) && (
        <>
          {pushAvailable() && (
            <div className="card stack">
              <div className="water-card" style={{ padding: 0, border: 'none', background: 'transparent' }}>
                <div>
                  <strong>Tägliche Erinnerung</strong>
                  <p className="muted" style={{ margin: 0 }}>
                    Abend-Push, falls du an dem Tag noch nichts getrackt hast.
                  </p>
                </div>
                <button
                  type="button"
                  className={reminderOn ? 'btn btn-primary btn-sm' : 'btn btn-soft btn-sm'}
                  aria-pressed={reminderOn ?? false}
                  onClick={() => { void toggleReminder() }}
                >
                  {reminderOn ? 'An' : 'Aus'}
                </button>
              </div>
              {reminderOn && (
                <div className="field">
                  <label htmlFor="reminder-time">Uhrzeit</label>
                  <input
                    id="reminder-time"
                    type="time"
                    value={reminderTime}
                    onChange={(e) => changeReminderTime(e.target.value)}
                  />
                </div>
              )}
              <div className="water-card" style={{ padding: 0, border: 'none', background: 'transparent' }}>
                <div>
                  <strong>Mahlzeiten-Erinnerungen</strong>
                  <p className="muted" style={{ margin: 0 }}>
                    Lernt, wann du üblicherweise trackst, und erinnert dich zur
                    passenden Zeit an Frühstück, Mittag- und Abendessen.
                  </p>
                </div>
                <button
                  type="button"
                  className={mealRemindersOn ? 'btn btn-primary btn-sm' : 'btn btn-soft btn-sm'}
                  aria-pressed={mealRemindersOn ?? false}
                  onClick={() => { void toggleMealReminders() }}
                >
                  {mealRemindersOn ? 'An' : 'Aus'}
                </button>
              </div>
              {reminderError && (
                <p className="banner error"><IconAlert /><span className="banner-text">{reminderError}</span></p>
              )}
            </div>
          )}
          {healthAvailable() && (
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
          )}
          {healthAvailable() && healthOn && activityBudget !== null && (
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
          {liveActivityAvailable() && (
            <div className="card water-card">
              <div>
                <strong>Live Activity</strong>
                <p className="muted" style={{ margin: 0 }}>
                  Tagesbilanz auf Sperrbildschirm und Dynamic Island.
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
        </>
      )}
        </>
      )}

      {section === 'yazio' && (
        <>
      {accounts === null ? (
        <p className="loading-inline"><span className="spinner" /> Lade Konten…</p>
      ) : accounts.length === 0 ? (
        <div className="empty">
          <span className="emoji"><IconUser /></span>
          <h3>Kein Konto verknüpft</h3>
          <p>Optional: Verknüpfe dein Yazio-Konto, um Einträge zu spiegeln und deinen Verlauf zu importieren.</p>
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

      <div className="card pad-lg stack">
        <strong>Konto verknüpfen</strong>
        <form className="stack" onSubmit={(e) => { void handleLink(e) }}>
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

        </>
      )}

      {section === 'shopping' && (
        <>
      <div className="card stack">
        <strong><IconCart /> Einkaufsliste</strong>
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

        </>
      )}

      {section === 'premium' && (
        <>
      <div className="card pad-lg stack">
        {premium ? (
          <>
            <div className="row-card" style={{ padding: 0, border: 'none', background: 'transparent' }}>
              <span className="row-icon"><IconStar /></span>
              <div className="row-main">
                <div className="row-title"><span className="text">Premium aktiv</span></div>
                <div className="row-sub">
                  {user?.premiumUntil
                    ? `Läuft bis ${new Date(user.premiumUntil).toLocaleDateString('de-DE')}`
                    : 'Danke für deine Unterstützung!'}
                </div>
              </div>
            </div>
            <a className="btn btn-soft btn-block" href={MANAGE_SUB_URL[getPlatform()] ?? MANAGE_SUB_URL.ios} target="_blank" rel="noopener noreferrer">
              Abo verwalten
            </a>
          </>
        ) : (
          <>
            <div>
              <strong>Mehr aus Tellerwert holen</strong>
              <p className="muted" style={{ margin: 0 }}>
                Unbegrenzte Rezept-Importe, KI-Foto-Tracking und mehr.
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setPaywall(true)}>
              <IconStar /> Premium freischalten
            </button>
          </>
        )}
      </div>

        </>
      )}

      {section === 'account' && (
        <>
      <div className="card stack">
        <div>
          <strong>Angemeldet als {user?.username ?? '–'}</strong>
        </div>
        <button type="button" className="btn btn-soft btn-block" onClick={() => { void logout() }}>
          <IconLogout /> Abmelden
        </button>
      </div>

      <div className="card stack">
        <a className="btn btn-soft btn-block" href={`${LEGAL_BASE}/datenschutz`} target="_blank" rel="noopener noreferrer">
          Datenschutzerklärung
        </a>
        <a className="btn btn-soft btn-block" href={`${LEGAL_BASE}/impressum`} target="_blank" rel="noopener noreferrer">
          Impressum
        </a>
      </div>

      <div className="card pad-lg stack">
        <div>
          <strong>Konto löschen</strong>
          <p className="muted" style={{ margin: 0 }}>
            Löscht dein Konto und alle Daten (Tagebuch, Ziele, Aktivität, Verknüpfungen)
            unwiderruflich. Das lässt sich nicht rückgängig machen.
          </p>
        </div>
        {deleteError && (
          <p className="banner error"><IconAlert /><span className="banner-text">{deleteError}</span></p>
        )}
        {!confirmDelete ? (
          <button
            type="button"
            className="btn btn-danger btn-block"
            onClick={() => { setConfirmDelete(true); setDeleteError(null) }}
          >
            <IconTrash /> Konto löschen
          </button>
        ) : (
          <div className="stack">
            <p className="banner error" style={{ margin: 0 }}>
              <IconAlert /><span className="banner-text">Wirklich löschen? Alle Daten werden sofort entfernt.</span>
            </p>
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={() => { void handleDeleteAccount() }}
              disabled={deleting}
            >
              {deleting ? <><span className="spinner" /> Lösche…</> : 'Ja, endgültig löschen'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

        </>
      )}

      {paywall && <PaywallSheet onClose={() => setPaywall(false)} />}
    </div>
  )
}
