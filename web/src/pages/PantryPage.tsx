import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api/client'
import { isDrink } from '../lib/nutrition'
import type { PantryItem } from '../api/types'
import { FoodPicker, type PickedItem } from '../components/FoodPicker'
import { IconBox, IconPlus, IconAlert, IconClose } from '../components/icons'

// BLS-Hauptgruppen-Buchstabe → freundliche Kategorie (siehe Memory BLS-Einheiten).
const BLS_GROUPS: Record<string, string> = {
  B: 'Brot & Backwaren', C: 'Getreide', D: 'Backwaren', E: 'Eier', F: 'Obst & Säfte',
  G: 'Gemüse', H: 'Hülsenfrüchte & Nüsse', K: 'Kartoffeln', M: 'Milchprodukte',
  N: 'Getränke', P: 'Alkohol', Q: 'Fette & Öle', R: 'Salz & Würze', S: 'Zucker & Süßes',
  T: 'Fisch', U: 'Fleisch', V: 'Gewürze', W: 'Wurst & Aufschnitt', X: 'Fertiggerichte', Y: 'Fertiggerichte',
}
function groupOf(item: PantryItem): string {
  if (item.source === 'bls' && item.category && BLS_GROUPS[item.category]) return BLS_GROUPS[item.category]!
  return 'Sonstiges'
}

function dateValue(ms: number | null): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseDate(s: string): number | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12, 0, 0).getTime() // lokale Mittagszeit (TZ-robust)
}
function expiryClass(ms: number | null): string {
  if (!ms) return ''
  const days = (ms - Date.now()) / 86_400_000
  if (days < 0) return 'exp-red'
  if (days <= 3) return 'exp-yellow'
  return 'exp-green'
}

export function PantryPage() {
  const [items, setItems] = useState<PantryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)

  const load = () => {
    api.pantry.list()
      .then((r) => setItems(r.items))
      .catch((e) => { if (e instanceof ApiError) setError('Vorrat konnte nicht geladen werden.'); else throw e })
  }
  useEffect(() => { load() }, [])

  const addPicked = async (picked: PickedItem[]) => {
    setError(null)
    try {
      const r = await api.pantry.add(picked.map((p) => ({ foodId: p.productId, amountG: Math.round(p.amountG) })))
      setItems(r.items)
    } catch (e) {
      if (e instanceof ApiError) setError('Hinzufügen fehlgeschlagen.'); else throw e
    }
  }

  const patchItem = (id: string, patch: { amountG?: number; expiresAt?: number | null }) => {
    setItems((cur) => cur && cur.map((it) => (it.id === id ? { ...it, ...patch } : it))) // optimistisch
    api.pantry.update(id, patch).catch(() => load())
  }
  const remove = (id: string) => {
    setItems((cur) => cur && cur.filter((it) => it.id !== id))
    api.pantry.remove(id).catch(() => load())
  }

  const groups = useMemo(() => {
    const map = new Map<string, PantryItem[]>()
    for (const it of items ?? []) {
      const g = groupOf(it)
      const arr = map.get(g)
      if (arr) arr.push(it)
      else map.set(g, [it])
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

      <button type="button" className="btn btn-primary btn-block" onClick={() => setPicker(true)}>
        <IconPlus /> Artikel hinzufügen
      </button>

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
            <ul className="list">
              {list.map((it) => {
                const unit = isDrink(it) ? 'ml' : 'g'
                return (
                  <li key={it.id}>
                    <div className="card pantry-item">
                      <div className="pantry-head">
                        <span className="pantry-name">{it.name}</span>
                        <button type="button" className="btn btn-icon btn-danger" aria-label={`${it.name} entfernen`} title="Entfernen"
                          onClick={() => remove(it.id)}>
                          <IconClose />
                        </button>
                      </div>
                      <div className="pantry-controls">
                        <div className="pie-amt">
                          <input type="number" inputMode="numeric" min={0} max={100000} value={Math.round(it.amountG)}
                            onChange={(e) => setItems((cur) => cur && cur.map((x) => (x.id === it.id ? { ...x, amountG: Number(e.target.value) || 0 } : x)))}
                            onBlur={(e) => { const v = Number(e.target.value) || 0; if (v > 0) patchItem(it.id, { amountG: v }) }} />
                          <span className="pie-unit">{unit}</span>
                        </div>
                        <label className={`pantry-mhd ${expiryClass(it.expiresAt)}`}>
                          MHD
                          <input type="date" value={dateValue(it.expiresAt)}
                            onChange={(e) => patchItem(it.id, { expiresAt: parseDate(e.target.value) })} />
                        </label>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}

      {picker && (
        <FoodPicker
          title="Zum Vorrat hinzufügen"
          submitLabel="In den Vorrat"
          onClose={() => setPicker(false)}
          onAdd={(picked) => { void addPicked(picked) }}
        />
      )}
    </div>
  )
}
