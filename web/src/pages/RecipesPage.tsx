import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { ImportedRecipe, RecipeDetail, RecipeIngredient, RecipeSummary, UserSettings } from '../api/types'
import { buildTrackerText } from '../lib/recipe'
import { IconBook, IconWand, IconBowl, IconTrash, IconCheck, IconClose, IconAlert, IconShare } from '../components/icons'

const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/e9161889953d4685b6e2a9fd181cf41d'
const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/ip(hone|ad|od)/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

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

const ingredientLine = (ing: RecipeIngredient): string =>
  [ing.quantity, ing.unit, ing.name].filter(Boolean).join(' ')

export function RecipesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // import
  const [mode, setMode] = useState<'text' | 'link'>('text')
  const [input, setInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const showHint = IS_IOS && settings != null && !settings.iosShortcutHintDismissed
  const dismissHint = () => {
    setSettings((s) => (s ? { ...s, iosShortcutHintDismissed: true } : { iosShortcutHintDismissed: true }))
    api.settings.update({ iosShortcutHintDismissed: true }).catch(() => {})
  }

  // editable preview
  const [preview, setPreview] = useState<ImportedRecipe | null>(null)
  const [title, setTitle] = useState('')
  const [servings, setServings] = useState('')
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [steps, setSteps] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // expand / track
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RecipeDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [factor, setFactor] = useState(1)

  const loadRecipes = () => {
    api.recipes.list().then(setRecipes).catch(() => setRecipes([]))
  }
  useEffect(() => {
    loadRecipes()
    api.settings.get().then(setSettings).catch(() => setSettings({ iosShortcutHintDismissed: false }))
  }, [])

  const runImport = async (payload: { url?: string; text?: string }) => {
    setImportError(null)
    setImporting(true)
    try {
      const r = await api.recipes.import(payload)
      setPreview(r)
      setTitle(r.title ?? '')
      setServings(r.servings ? String(r.servings) : '')
      setIngredients(r.ingredients)
      setSteps(r.steps)
    } catch (e) {
      if (e instanceof ApiError) {
        setImportError(importErrorMessage(e.message))
        setImportOpen(true) // reveal the manual controls so the user can retry/paste
      } else throw e
    } finally {
      setImporting(false)
    }
  }

  const handleImport = () => {
    if (!input.trim() || importing) return
    void runImport(mode === 'link' ? { url: input.trim() } : { text: input })
  }

  // Deep link: /recipes?import=<url> (or ?import_text=<text>) auto-runs an import.
  // Lets an iOS Shortcut on the share sheet feed in shared links — iOS has no
  // Web Share Target API, so this is the iPhone path.
  useEffect(() => {
    const url = searchParams.get('import')
    const text = searchParams.get('import_text')
    if (!url && !text) return
    if (url) {
      setMode('link')
      setInput(url)
      void runImport({ url })
    } else if (text) {
      setMode('text')
      setInput(text)
      void runImport({ text })
    }
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        steps,
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
      if (expandedId === id) setExpandedId(null)
      loadRecipes()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setError(null)
    setFactor(1)
    setExpandedId(id)
    setDetail(null)
    setLoadingDetail(true)
    try {
      setDetail(await api.recipes.get(id))
    } catch (e) {
      setExpandedId(null)
      if (e instanceof ApiError) setError(e.message)
      else throw e
    } finally {
      setLoadingDetail(false)
    }
  }

  const confirmTrack = () => {
    if (!detail) return
    navigate('/', { state: { presetText: buildTrackerText(detail.ingredients, factor) } })
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Rezepte</h1>
        <span className="sub">Aus Instagram, Blogs oder Text importieren – mit Kochschritten und portionsweisem Tracken.</span>
      </header>

      {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

      {importing && (
        <p className="banner info">
          <span className="spinner" />
          <span className="banner-text">Rezept wird importiert … das kann ein paar Sekunden dauern.</span>
        </p>
      )}

      {importError && <p className="banner error"><IconAlert /><span className="banner-text">{importError}</span></p>}

      {showHint && (
        <div className="card stack">
          <span className="d-title"><IconShare /> Vom iPhone teilen</span>
          <p className="muted">
            Teile Rezepte direkt aus Instagram: Kurzbefehl einmal hinzufügen, dann erscheint
            „Rezept zu Eazio" in Instagrams Teilen-Menü.
          </p>
          <a className="btn btn-primary btn-sm" href={SHORTCUT_URL} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
            <IconShare /> Kurzbefehl hinzufügen
          </a>
          <ol className="recipe-list">
            <li>Oben „Kurzbefehl hinzufügen" tippen und in der Kurzbefehle-App bestätigen.</li>
            <li>In Instagram beim Reel auf Teilen → „Rezept zu Eazio".</li>
          </ol>
          <label className="hint-check">
            <input type="checkbox" onChange={(e) => { if (e.target.checked) dismissHint() }} />
            Eingerichtet – diesen Hinweis ausblenden
          </label>
        </div>
      )}

      {/* Manual import — collapsible secondary path */}
      <div className="card stack">
        <button type="button" className="disclosure" aria-expanded={importOpen} onClick={() => setImportOpen((o) => !o)}>
          <span className="d-title"><IconWand /> Manuell importieren</span>
          <span className="d-toggle" aria-hidden="true">{importOpen ? '−' : '+'}</span>
        </button>
        {importOpen && (
          <>
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
                  placeholder="https://… (Instagram, Blog, Webseite)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <span className="muted">Instagram-Reels werden automatisch geladen; klappt das mal nicht, einfach die Caption als Text einfügen.</span>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="rec-text">Rezept-Text / Caption</label>
                <textarea
                  id="rec-text"
                  rows={6}
                  placeholder={'Titel, Zutaten und Zubereitung hier einfügen…'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => { void handleImport() }}
              disabled={importing || !input.trim()}
            >
              {importing ? <><span className="spinner" /> Importieren…</> : <><IconWand /> Importieren</>}
            </button>
          </>
        )}
      </div>

      {/* Preview */}
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
                    <span className="row-main"><span className="row-title"><span className="text">{ingredientLine(ing)}</span></span></span>
                    <button type="button" className="btn btn-icon btn-ghost btn-sm" aria-label="Zutat entfernen" onClick={() => setIngredients((p) => p.filter((_, j) => j !== i))}>
                      <IconClose />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {steps.length > 0 && (
            <div className="field">
              <span className="label">Kochschritte ({steps.length})</span>
              <ol className="recipe-list steps">
                {steps.map((s, i) => (
                  <li key={i}>
                    {s}{' '}
                    <button type="button" className="btn btn-icon btn-ghost btn-sm" aria-label="Schritt entfernen" style={{ verticalAlign: 'middle' }} onClick={() => setSteps((p) => p.filter((_, j) => j !== i))}>
                      <IconClose />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="btn-row">
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => { void handleSave() }} disabled={saving || ingredients.length === 0}>
              <IconCheck /> {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>Verwerfen</button>
          </div>
        </div>
      )}

      {/* Saved recipes */}
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
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void toggleExpand(r.id) }}>
                    {expandedId === r.id ? 'Schließen' : 'Öffnen'}
                  </button>
                  <button type="button" className="btn btn-icon btn-danger" aria-label={`${r.title} löschen`} onClick={() => { void handleDelete(r.id) }}>
                    <IconTrash />
                  </button>
                </div>
              </div>

              {expandedId === r.id && (
                <div className="card stack" style={{ marginTop: '0.5rem' }}>
                  {loadingDetail ? (
                    <p className="loading-inline"><span className="spinner" /> Lade…</p>
                  ) : detail ? (
                    <>
                      <div>
                        <span className="label">Zutaten</span>
                        <ul className="recipe-list">
                          {detail.ingredients.map((ing, i) => (
                            <li key={i}>{ingredientLine(ing)}</li>
                          ))}
                        </ul>
                      </div>

                      {detail.steps.length > 0 && (
                        <div>
                          <span className="label">Kochschritte</span>
                          <ol className="recipe-list steps">
                            {detail.steps.map((s, i) => <li key={i}>{s}</li>)}
                          </ol>
                        </div>
                      )}

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
                      <button type="button" className="btn btn-primary btn-block" onClick={confirmTrack}>
                        <IconBowl /> In den Tracker
                      </button>
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
