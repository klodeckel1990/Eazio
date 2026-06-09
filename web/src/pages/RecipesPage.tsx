import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { ImportedRecipe, RecipeDetail, RecipeIngredient, RecipeSummary } from '../api/types'
import { buildTrackerText } from '../lib/recipe'
import { IconBook, IconWand, IconBowl, IconTrash, IconCheck, IconClose, IconAlert } from '../components/icons'

const FACTORS = [
  { label: 'Ganzes', value: 1 },
  { label: '½', value: 0.5 },
  { label: '⅓', value: 1 / 3 },
  { label: '¼', value: 0.25 },
]

function importErrorMessage(code: string): string {
  switch (code) {
    case 'import_unavailable':
      return 'Import ist nicht konfiguriert (kein API-Key auf dem Server).'
    case 'fetch_failed':
      return 'Der Link konnte nicht geladen werden – füge stattdessen den Text/die Caption ein.'
    case 'no_content':
      return 'Es konnten keine Zutaten gefunden werden.'
    case 'invalid_input':
      return 'Bitte einen gültigen Link oder Text angeben.'
    case 'llm_failed':
      return 'Die Zutaten-Erkennung ist fehlgeschlagen. Bitte erneut versuchen.'
    default:
      return 'Import fehlgeschlagen.'
  }
}

export function RecipesPage() {
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // import
  const [mode, setMode] = useState<'text' | 'link'>('text')
  const [input, setInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  // editable preview
  const [preview, setPreview] = useState<ImportedRecipe | null>(null)
  const [title, setTitle] = useState('')
  const [servings, setServings] = useState('')
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [saving, setSaving] = useState(false)

  // tracking
  const [trackId, setTrackId] = useState<string | null>(null)
  const [trackDetail, setTrackDetail] = useState<RecipeDetail | null>(null)
  const [factor, setFactor] = useState(1)
  const [loadingTrack, setLoadingTrack] = useState(false)

  const loadRecipes = () => {
    api.recipes.list().then(setRecipes).catch(() => setRecipes([]))
  }
  useEffect(() => { loadRecipes() }, [])

  const handleImport = async () => {
    if (!input.trim() || importing) return
    setImportError(null)
    setImporting(true)
    try {
      const r = await api.recipes.import(mode === 'link' ? { url: input.trim() } : { text: input })
      setPreview(r)
      setTitle(r.title ?? '')
      setServings(r.servings ? String(r.servings) : '')
      setIngredients(r.ingredients)
    } catch (e) {
      if (e instanceof ApiError) setImportError(importErrorMessage(e.message))
      else throw e
    } finally {
      setImporting(false)
    }
  }

  const handleSave = async () => {
    if (ingredients.length === 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      const n = Number(servings)
      const servingsValue = servings.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null
      await api.recipes.create({
        title: title.trim() || null,
        servings: servingsValue,
        sourceUrl: preview?.sourceUrl ?? null,
        sourceType: preview?.source ?? 'text',
        ingredients,
      })
      setPreview(null)
      setInput('')
      loadRecipes()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.recipes.remove(id)
      if (trackId === id) setTrackId(null)
      loadRecipes()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  const startTrack = async (id: string) => {
    if (trackId === id) {
      setTrackId(null)
      return
    }
    setError(null)
    setFactor(1)
    setTrackId(id)
    setTrackDetail(null)
    setLoadingTrack(true)
    try {
      setTrackDetail(await api.recipes.get(id))
    } catch (e) {
      setTrackId(null)
      if (e instanceof ApiError) setError(e.message)
      else throw e
    } finally {
      setLoadingTrack(false)
    }
  }

  const confirmTrack = () => {
    if (!trackDetail) return
    const presetText = buildTrackerText(trackDetail.ingredients, factor)
    navigate('/', { state: { presetText } })
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Rezepte</h1>
        <span className="sub">Aus Instagram, Blogs oder Text importieren – und portionsweise tracken.</span>
      </header>

      {error && (
        <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
      )}

      <div className="card pad-lg stack">
        <h2 className="section-title">Importieren</h2>
        <div className="seg" role="group" aria-label="Importquelle">
          <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Text einfügen</button>
          <button type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Link</button>
        </div>
        {mode === 'link' ? (
          <div className="field">
            <label htmlFor="rec-url">Rezept-Link</label>
            <input
              id="rec-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              placeholder="https://… (Blog/Webseite)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <span className="muted">Instagram lädt oft nicht automatisch – dann einfach die Caption als Text einfügen.</span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="rec-text">Rezept-Text / Caption</label>
            <textarea
              id="rec-text"
              rows={6}
              placeholder={'Titel und Zutatenliste hier einfügen…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
        )}
        {importError && (
          <p className="banner error"><IconAlert /><span className="banner-text">{importError}</span></p>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => { void handleImport() }}
          disabled={importing || !input.trim()}
        >
          {importing ? <><span className="spinner" /> Importieren…</> : <><IconWand /> Importieren</>}
        </button>
      </div>

      {preview && (
        <div className="card pad-lg stack">
          <h2 className="section-title">Vorschau</h2>
          <div className="field">
            <label htmlFor="prev-title">Titel</label>
            <input id="prev-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rezeptname" />
          </div>
          <div className="field">
            <label htmlFor="prev-serv">Portionen</label>
            <input id="prev-serv" type="number" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="z. B. 4" style={{ width: '8rem' }} />
          </div>
          <div className="field">
            <span className="label">Zutaten ({ingredients.length})</span>
            <ul className="list">
              {ingredients.map((ing, i) => (
                <li key={i}>
                  <div className="row-card" style={{ padding: '0.5rem 0.75rem' }}>
                    <span className="row-main">
                      <span className="row-title"><span className="text">{[ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')}</span></span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost btn-sm"
                      aria-label="Zutat entfernen"
                      onClick={() => setIngredients((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <IconClose />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => { void handleSave() }} disabled={saving || ingredients.length === 0}>
              <IconCheck /> {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>Verwerfen</button>
          </div>
        </div>
      )}

      <h2 className="section-title">Gespeicherte Rezepte</h2>
      {recipes === null ? (
        <p className="loading-inline"><span className="spinner" /> Lade Rezepte…</p>
      ) : recipes.length === 0 ? (
        <div className="empty">
          <span className="emoji"><IconBook /></span>
          <h3>Noch keine Rezepte</h3>
          <p>Importiere oben dein erstes Rezept aus einem Link oder per eingefügtem Text.</p>
        </div>
      ) : (
        <ul className="list">
          {recipes.map((r) => (
            <li key={r.id}>
              <div className="row-card">
                <span className="row-icon alt"><IconBook /></span>
                <div className="row-main">
                  <div className="row-title"><span className="text">{r.title}</span></div>
                  {r.servings != null && <div className="row-sub">{r.servings} Portionen</div>}
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { void startTrack(r.id) }}>
                    <IconBowl /> Tracken
                  </button>
                  <button type="button" className="btn btn-icon btn-danger" aria-label={`${r.title} löschen`} onClick={() => { void handleDelete(r.id) }}>
                    <IconTrash />
                  </button>
                </div>
              </div>

              {trackId === r.id && (
                <div className="card stack" style={{ marginTop: '0.5rem' }}>
                  {loadingTrack ? (
                    <p className="loading-inline"><span className="spinner" /> Lade…</p>
                  ) : trackDetail ? (
                    <>
                      <span className="label">Wie viel vom Rezept tracken?</span>
                      <div className="seg" role="group" aria-label="Portionsanteil">
                        {FACTORS.map((f) => (
                          <button key={f.label} type="button" aria-pressed={Math.abs(factor - f.value) < 0.001} onClick={() => setFactor(f.value)}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <div className="field">
                        <label htmlFor={`factor-${r.id}`}>Eigener Faktor (×)</label>
                        <input
                          id={`factor-${r.id}`}
                          type="number"
                          inputMode="decimal"
                          step="0.25"
                          min="0"
                          value={Math.round(factor * 100) / 100}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (Number.isFinite(v) && v > 0) setFactor(v)
                          }}
                          style={{ width: '8rem' }}
                        />
                      </div>
                      {r.servings != null && (
                        <span className="muted">≈ {Math.round(r.servings * factor * 100) / 100} {Math.abs(r.servings * factor - 1) < 0.001 ? 'Portion' : 'Portionen'}</span>
                      )}
                      <div className="btn-row">
                        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={confirmTrack}>
                          <IconBowl /> In den Tracker
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setTrackId(null)}>Abbrechen</button>
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
