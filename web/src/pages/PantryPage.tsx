import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { PantryItem } from '../api/types'
import { groupOf, unitOf, expiryClass, expiryLabel } from '../lib/pantry'
import { PantryAddSheet, PantryEditSheet, PantryMatchesSheet, PantryWizardSheet } from '../components/PantrySheets'
import { PaywallSheet } from '../components/PaywallSheet'
import { IconBox, IconPlus, IconAlert, IconChevronRight, IconBowl, IconSparkle } from '../components/icons'

export function PantryPage() {
  const { premium } = useAuth()
  const [items, setItems] = useState<PantryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PantryItem | null>(null)
  const [matches, setMatches] = useState(false)
  const [wizard, setWizard] = useState(false)
  const [paywall, setPaywall] = useState(false)

  const load = () => {
    api.pantry.list()
      .then((r) => setItems(r.items))
      .catch((e) => { if (e instanceof ApiError) setError('Vorrat konnte nicht geladen werden.'); else throw e })
  }
  useEffect(() => { load() }, [])

  // nach Kategorie gruppieren; je Gruppe bald-ablaufende zuerst, dann Name.
  const groups = useMemo(() => {
    const map = new Map<string, PantryItem[]>()
    for (const it of items ?? []) {
      const g = groupOf(it)
      const arr = map.get(g)
      if (arr) arr.push(it)
      else map.set(g, [it])
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ea = a.expiresAt ?? Infinity
        const eb = b.expiresAt ?? Infinity
        return ea !== eb ? ea - eb : a.name.localeCompare(b.name, 'de')
      })
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))
  }, [items])

  return (
    <div className="page">
      <header className="page-head">
        <h1>Vorratsschrank</h1>
        <span className="sub">Was du zu Hause hast – die Basis für deine Rezepte.</span>
      </header>

      {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

      <button type="button" className="btn btn-primary btn-block" onClick={() => setAdding(true)}>
        <IconPlus /> Artikel hinzufügen
      </button>
      <div className="pantry-actions">
        <button type="button" className="btn btn-soft" onClick={() => (premium ? setMatches(true) : setPaywall(true))}>
          <IconBowl /> Was kann ich kochen?
        </button>
        <button type="button" className="btn btn-soft" onClick={() => (premium ? setWizard(true) : setPaywall(true))}>
          <IconSparkle /> Koch-Idee (KI)
        </button>
      </div>

      {items === null ? (
        <p className="loading-inline"><span className="spinner" /> Lade Vorrat…</p>
      ) : items.length === 0 ? (
        <div className="empty">
          <span className="emoji"><IconBox /></span>
          <h3>Dein Vorrat ist leer</h3>
          <p>Füge Lebensmittel hinzu (suchen oder Barcode scannen) – daraus findet die App später passende Rezepte.</p>
        </div>
      ) : (
        groups.map(([group, list]) => (
          <div key={group}>
            <h2 className="section-title">{group}</h2>
            <ul className="list pantry-list">
              {list.map((it) => (
                <li key={it.id}>
                  <button type="button" className="pantry-row" onClick={() => setEditing(it)}>
                    <span className="pantry-row-info">
                      <span className="pantry-row-name">{it.name}</span>
                      <span className="pantry-row-meta">
                        <span className="pantry-amt">{Math.round(it.amountG)} {unitOf(it)}</span>
                        {it.expiresAt != null && (
                          <span className={`pantry-exp ${expiryClass(it.expiresAt)}`}>{expiryLabel(it.expiresAt)}</span>
                        )}
                      </span>
                    </span>
                    <IconChevronRight />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {adding && <PantryAddSheet onClose={() => setAdding(false)} onAdded={load} />}
      {editing && <PantryEditSheet item={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {matches && <PantryMatchesSheet onClose={() => setMatches(false)} />}
      {wizard && <PantryWizardSheet itemCount={items?.length ?? 0} onClose={() => setWizard(false)} />}
      {paywall && (
        <PaywallSheet
          title="Rezepte aus deinem Vorrat"
          subtitle="Finde passende Rezepte und lass dir aus deinen Vorräten eine Koch-Idee erstellen – im Rahmen deines Budgets."
          onClose={() => setPaywall(false)}
        />
      )}
    </div>
  )
}
