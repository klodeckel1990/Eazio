// Premium-Paywall als Bottom-Sheet (Portal wie CalendarSheet). Kauf nur nativ
// (RevenueCat); im Web ein Hinweis. Wird aus den Gating-Stellen (Import-Limit,
// KI-Foto) und der Einstellungen-Sektion geöffnet.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { billingAvailable, getPackages, purchase, restorePurchases, type BillingPackage } from '../lib/billing'
import { useAuth } from '../auth/AuthContext'
import { IconClose, IconCheckCircle, IconAlert, IconSparkle } from './icons'

const LEGAL = 'https://tellerwert.de'
const FEATURES = [
  'Unbegrenzte Rezept-Importe',
  'KI-Foto-Tracking',
  'Smarte Mahlzeiten-Erinnerungen',
  'Yazio-Verlaufsimport',
  'Unbegrenzte Rezepte & Presets',
]
const PERIOD_LABEL: Record<BillingPackage['period'], string> = { year: 'pro Jahr', month: 'pro Monat', other: '' }

export function PaywallSheet({ title = 'Tellerwert Premium', subtitle, onClose }: {
  title?: string
  subtitle?: string
  onClose: () => void
}) {
  const { refreshEntitlement } = useAuth()
  const native = billingAvailable()
  const [pkgs, setPkgs] = useState<BillingPackage[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!native) { setPkgs([]); return }
    getPackages()
      .then((p) => setPkgs([...p].sort((a, b) => (a.period === 'year' ? -1 : b.period === 'year' ? 1 : 0))))
      .catch(() => { setPkgs([]); setError('Angebote konnten nicht geladen werden.') })
  }, [native])

  const finish = async (ok: boolean, failMsg: string) => {
    if (ok) { await refreshEntitlement(); onClose() }
    else setError(failMsg)
  }
  const buy = async (p: BillingPackage) => {
    setBusy(true); setError(null)
    try { await finish(await purchase(p), 'Kauf nicht abgeschlossen.') }
    catch { setError('Kauf fehlgeschlagen oder abgebrochen.') }
    finally { setBusy(false) }
  }
  const restore = async () => {
    setBusy(true); setError(null)
    try { await finish(await restorePurchases(), 'Keine aktiven Käufe gefunden.') }
    catch { setError('Wiederherstellen fehlgeschlagen.') }
    finally { setBusy(false) }
  }

  return createPortal(
    <div className="cal-overlay" onClick={onClose} role="presentation">
      <div className="add-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tellerwert Premium">
        <div className="add-sheet-head">
          <h3><IconSparkle /> {title}</h3>
          <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>
        {subtitle && <p className="muted" style={{ marginTop: 0 }}>{subtitle}</p>}

        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '4px 0 12px', gap: '.4rem' }}>
          {FEATURES.map((f) => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}><IconCheckCircle /> {f}</li>
          ))}
        </ul>

        {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

        {!native ? (
          <p className="muted">
            Premium schließt du in der Tellerwert-App (iOS/Android) ab — <strong>1,99 € pro Monat</strong> oder
            <strong> 19,99 € pro Jahr</strong>.
          </p>
        ) : pkgs === null ? (
          <p className="loading-inline"><span className="spinner" /> Angebote laden…</p>
        ) : pkgs.length === 0 ? (
          <p className="muted">Derzeit keine Angebote verfügbar. Bitte später erneut versuchen.</p>
        ) : (
          <div className="stack">
            {pkgs.map((p) => (
              <button key={p.id} type="button" className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => { void buy(p) }}>
                {p.priceString} {PERIOD_LABEL[p.period]}{p.period === 'year' ? ' · bester Preis' : ''}
              </button>
            ))}
            <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => { void restore() }}>
              Kauf wiederherstellen
            </button>
          </div>
        )}

        <p className="muted small" style={{ marginBottom: 0 }}>
          Automatische Verlängerung, jederzeit im Store kündbar.{' '}
          <a href={`${LEGAL}/nutzungsbedingungen`} target="_blank" rel="noopener noreferrer">Nutzungsbedingungen</a>
          {' · '}
          <a href={`${LEGAL}/datenschutz`} target="_blank" rel="noopener noreferrer">Datenschutz</a>
        </p>
      </div>
    </div>,
    document.body,
  )
}
