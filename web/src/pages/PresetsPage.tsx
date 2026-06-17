import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { isDrink } from '../lib/nutrition'
import type { Preset, RecentFood } from '../api/types'
import { FoodPicker, type PickedItem } from '../components/FoodPicker'
import { IconBookmark, IconTrash, IconAlert, IconPlus, IconChevronLeft, IconChevronRight, IconCheck } from '../components/icons'

interface EditItem {
  key: string
  rawText: string
  productId: string
  amountG: number
  serving: string | null
  servingQuantity: number | null
  unit: 'g' | 'ml'
}
let _seq = 0
const nextKey = () => `pi-${_seq++}`

export function PresetsPage() {
  const navigate = useNavigate()
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Ansehen/Bearbeiten (id === null → neues Preset)
  const [editing, setEditing] = useState<{ id: string | null; name: string; items: EditItem[] } | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Neu aus Verlauf
  const [historyOpen, setHistoryOpen] = useState(false)
  const [recent, setRecent] = useState<RecentFood[] | null>(null)
  const [picked, setPicked] = useState<Record<string, { on: boolean; amountG: number }>>({})
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const loadPresets = () => {
    api.presets.list()
      .then(setPresets)
      .catch(err => { if (err instanceof ApiError) setError(err.message); else throw err })
  }
  useEffect(() => { loadPresets() }, [])

  const handleLoad = async (id: string) => {
    try {
      const p = await api.presets.get(id)
      void navigate('/', { state: { presetText: p.items.map(i => i.rawText).join('\n') } })
    } catch (err) {
      if (err instanceof ApiError) setError(err.message); else throw err
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await api.presets.remove(id)
      if (editing?.id === id) setEditing(null)
      loadPresets()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message); else throw err
    }
  }

  const openEdit = async (id: string) => {
    setError(null)
    setEditLoading(true)
    setEditing({ id, name: '', items: [] })
    try {
      const p = await api.presets.get(id)
      setEditing({
        id,
        name: p.name,
        items: p.items.map(it => ({
          key: nextKey(),
          rawText: it.rawText,
          productId: it.productId,
          amountG: it.amountG,
          serving: it.serving,
          servingQuantity: it.servingQuantity,
          unit: it.unit ?? 'g',
        })),
      })
    } catch (err) {
      if (err instanceof ApiError) { setError('Preset konnte nicht geladen werden.'); setEditing(null) }
      else throw err
    } finally {
      setEditLoading(false)
    }
  }

  const newPreset = () => {
    setError(null)
    setEditing({ id: null, name: '', items: [] })
  }

  const addPicked = (items: PickedItem[]) => {
    setEditing((cur) => cur && ({
      ...cur,
      items: [
        ...cur.items,
        ...items.map((it) => ({
          key: nextKey(),
          rawText: it.rawText,
          productId: it.productId,
          amountG: Math.round(it.amountG),
          serving: null,
          servingQuantity: null,
          unit: (it.food && isDrink(it.food) ? 'ml' : 'g') as 'g' | 'ml',
        })),
      ],
    }))
  }

  const saveEdit = async () => {
    if (!editing || saving) return
    if (!editing.name.trim()) { setError('Bitte einen Namen vergeben.'); return }
    if (editing.items.length === 0) { setError('Mindestens eine Zutat hinzufügen.'); return }
    setSaving(true)
    setError(null)
    const payloadItems = editing.items.map(it => ({
      rawText: it.rawText,
      productId: it.productId,
      amountG: it.amountG,
      serving: it.serving,
      servingQuantity: it.servingQuantity,
    }))
    try {
      if (editing.id === null) {
        await api.presets.create(editing.name.trim(), payloadItems)
      } else {
        await api.presets.update(editing.id, { name: editing.name.trim(), items: payloadItems })
      }
      setEditing(null)
      loadPresets()
    } catch (err) {
      if (err instanceof ApiError) setError(err.status === 409 ? 'Name bereits vergeben.' : 'Speichern fehlgeschlagen.')
      else throw err
    } finally {
      setSaving(false)
    }
  }

  const openHistory = async () => {
    setError(null)
    setHistoryOpen(true)
    setRecent(null)
    setPicked({})
    setNewName('')
    try {
      const { foods } = await api.diary.recentFoods(40)
      setRecent(foods)
    } catch (err) {
      if (err instanceof ApiError) setError('Verlauf konnte nicht geladen werden.'); else throw err
    }
  }

  const togglePick = (f: RecentFood) => {
    setPicked(p => {
      const cur = p[f.foodId]
      return { ...p, [f.foodId]: { on: !cur?.on, amountG: cur?.amountG ?? Math.round(f.amountG) } }
    })
  }

  const createFromHistory = async () => {
    const items = (recent ?? [])
      .filter(f => picked[f.foodId]?.on)
      .map(f => ({ rawText: f.name, productId: f.foodId, amountG: picked[f.foodId]?.amountG ?? Math.round(f.amountG), serving: null, servingQuantity: null }))
    if (!newName.trim()) { setError('Bitte einen Namen vergeben.'); return }
    if (items.length === 0) { setError('Mindestens ein Lebensmittel auswählen.'); return }
    setCreating(true)
    setError(null)
    try {
      await api.presets.create(newName.trim(), items)
      setHistoryOpen(false)
      loadPresets()
    } catch (err) {
      if (err instanceof ApiError) setError(err.status === 409 ? 'Name bereits vergeben.' : 'Erstellen fehlgeschlagen.')
      else throw err
    } finally {
      setCreating(false)
    }
  }

  // ---- Bearbeiten-Ansicht ----
  if (editing) {
    return (
      <div className="page">
        <header className="page-head settings-subhead">
          <button type="button" className="btn btn-ghost btn-sm settings-back" onClick={() => setEditing(null)}>
            <IconChevronLeft /> Presets
          </button>
          <h1>{editing.id === null ? 'Neues Preset' : 'Preset bearbeiten'}</h1>
        </header>
        {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}
        {editLoading ? (
          <p className="loading-inline"><span className="spinner" /> Lädt…</p>
        ) : (
          <>
            <div className="card stack">
              <div className="field">
                <label htmlFor="preset-name">Name</label>
                <input id="preset-name" type="text" maxLength={64} value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </div>
            </div>
            <h2 className="section-title">Zutaten</h2>
            <ul className="list">
              {editing.items.map((it, i) => (
                <li key={it.key}>
                  <div className="card preset-item-edit">
                    <span className="pie-name">{it.rawText}</span>
                    <div className="pie-amt">
                      <input type="number" inputMode="numeric" min={0} max={20000} value={it.amountG}
                        onChange={e => setEditing({ ...editing, items: editing.items.map((x, xi) => xi === i ? { ...x, amountG: Number(e.target.value) || 0 } : x) })} />
                      <span className="pie-unit">{it.unit}</span>
                    </div>
                    <button type="button" className="btn btn-icon btn-danger" aria-label="Zutat entfernen" title="Entfernen"
                      onClick={() => setEditing({ ...editing, items: editing.items.filter((_, xi) => xi !== i) })}>
                      <IconTrash />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {editing.items.length === 0 && (
              <p className="muted">Noch keine Zutaten – über „Zutat hinzufügen" matchen, suchen oder scannen.</p>
            )}
            <button type="button" className="btn btn-soft btn-block" onClick={() => setPickerOpen(true)}>
              <IconPlus /> Zutat hinzufügen
            </button>
            <div className="btn-row">
              <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }}
                onClick={() => { void saveEdit() }} disabled={saving || editing.items.length === 0}>
                <IconCheck /> {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
            {editing.id !== null && (
              <button type="button" className="btn btn-danger btn-block" onClick={() => { void handleRemove(editing.id!) }}>
                <IconTrash /> Preset löschen
              </button>
            )}
          </>
        )}
        {pickerOpen && (
          <FoodPicker title="Zutaten hinzufügen" onClose={() => setPickerOpen(false)} onAdd={addPicked} />
        )}
      </div>
    )
  }

  // ---- Neu aus Verlauf ----
  if (historyOpen) {
    return (
      <div className="page">
        <header className="page-head settings-subhead">
          <button type="button" className="btn btn-ghost btn-sm settings-back" onClick={() => setHistoryOpen(false)}>
            <IconChevronLeft /> Presets
          </button>
          <h1>Neu aus Verlauf</h1>
        </header>
        {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}
        <div className="card stack">
          <div className="field">
            <label htmlFor="new-preset-name">Name</label>
            <input id="new-preset-name" type="text" maxLength={64} placeholder="z. B. Standard-Frühstück"
              value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
        </div>
        <h2 className="section-title">Zuletzt getrackt</h2>
        {recent === null ? (
          <p className="loading-inline"><span className="spinner" /> Lädt…</p>
        ) : recent.length === 0 ? (
          <div className="empty">
            <span className="emoji"><IconBookmark /></span>
            <h3>Noch kein Verlauf</h3>
            <p>Tracke ein paar Mahlzeiten – sie erscheinen dann hier zur Auswahl.</p>
          </div>
        ) : (
          <ul className="list">
            {recent.map(f => {
              const sel = picked[f.foodId]
              return (
                <li key={f.foodId}>
                  <div className={`card preset-pick ${sel?.on ? 'is-on' : ''}`}>
                    <button type="button" className="pick-main" aria-pressed={sel?.on ?? false} onClick={() => togglePick(f)}>
                      <span className="pick-check">{sel?.on ? <IconCheck /> : null}</span>
                      <span className="pick-name">{f.name}</span>
                    </button>
                    <div className="pie-amt">
                      <input type="number" inputMode="numeric" min={0} max={20000} disabled={!sel?.on}
                        value={sel?.amountG ?? Math.round(f.amountG)}
                        onChange={e => setPicked(p => ({ ...p, [f.foodId]: { on: true, amountG: Number(e.target.value) || 0 } }))} />
                      <span className="pie-unit">{isDrink(f) ? 'ml' : 'g'}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="btn-row">
          <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }}
            onClick={() => { void createFromHistory() }} disabled={creating}>
            <IconCheck /> {creating ? 'Erstellen…' : 'Preset erstellen'}
          </button>
        </div>
      </div>
    )
  }

  // ---- Liste ----
  return (
    <div className="page">
      <header className="page-head">
        <h1>Presets</h1>
        <span className="sub">Gespeicherte Zutatenlisten – mit einem Tipp in den Tracker.</span>
      </header>

      {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

      <div className="btn-row preset-new">
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={newPreset}>
          <IconPlus /> Neues Preset
        </button>
        <button type="button" className="btn btn-soft" style={{ flex: 1 }} onClick={() => { void openHistory() }}>
          <IconBookmark /> Aus Verlauf
        </button>
      </div>

      {presets === null ? (
        <p className="loading-inline"><span className="spinner" /> Lade Presets…</p>
      ) : presets.length === 0 ? (
        <div className="empty">
          <span className="emoji"><IconBookmark /></span>
          <h3>Noch keine Presets</h3>
          <p>Speichere im Tracker eine Zutatenliste als Preset oder erstelle eines aus deinem Verlauf.</p>
        </div>
      ) : (
        <ul className="list">
          {presets.map(preset => (
            <li key={preset.id}>
              <div className="card preset-card">
                <button type="button" className="preset-open" onClick={() => { void openEdit(preset.id) }}>
                  <span className="row-icon alt"><IconBookmark /></span>
                  <span className="preset-name">{preset.name}</span>
                  <IconChevronRight className="preset-chev" />
                </button>
                <div className="preset-actions">
                  <button type="button" className="btn btn-primary" onClick={() => { void handleLoad(preset.id) }}>
                    Im Tracker laden
                  </button>
                  <button type="button" className="btn btn-icon btn-danger" aria-label={`${preset.name} löschen`} title="Löschen"
                    onClick={() => { void handleRemove(preset.id) }}>
                    <IconTrash />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
