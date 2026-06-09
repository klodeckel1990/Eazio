import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { ImportedRecipe, RecipeIngredient, UserSettings } from '../api/types'
import { IconWand, IconCheck, IconClose, IconAlert, IconShare } from '../components/icons'

const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/e9161889953d4685b6e2a9fd181cf41d'
const DIFFICULTIES = ['einfach', 'mittel', 'schwer'] as const
const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/ip(hone|ad|od)/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

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

export function ImportPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [mode, setMode] = useState<'text' | 'link'>('text')
  const [input, setInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const [preview, setPreview] = useState<ImportedRecipe | null>(null)
  const [title, setTitle] = useState('')
  const [servings, setServings] = useState('')
  const [difficulty, setDifficulty] = useState<string | null>(null)
  const [minutes, setMinutes] = useState('')
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [steps, setSteps] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [settings, setSettings] = useState<UserSettings | null>(null)
  const showHint = IS_IOS && settings != null && !settings.iosShortcutHintDismissed
  const dismissHint = () => {
    setSettings((s) => (s ? { ...s, iosShortcutHintDismissed: true } : s))
    api.settings.update({ iosShortcutHintDismissed: true }).catch(() => {})
  }

  const runImport = async (payload: { url?: string; text?: string }) => {
    setImportError(null)
    setImporting(true)
    try {
      const r = await api.recipes.import(payload)
      setPreview(r)
      setTitle(r.title ?? '')
      setServings(r.servings ? String(r.servings) : '')
      setDifficulty(r.difficulty)
      setMinutes(r.totalMinutes ? String(r.totalMinutes) : '')
      setIngredients(r.ingredients)
      setSteps(r.steps)
    } catch (e) {
      if (e instanceof ApiError) setImportError(importErrorMessage(e.message))
      else throw e
    } finally {
      setImporting(false)
    }
  }

  const handleImport = () => {
    if (!input.trim() || importing) return
    void runImport(mode === 'link' ? { url: input.trim() } : { text: input })
  }

  useEffect(() => {
    api.settings.get().then(setSettings).catch(() =>
      setSettings({ iosShortcutHintDismissed: false, shoppingListFormat: 'plain', onboardingDone: true }),
    )
  }, [])

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
    setImportError(null)
    try {
      const n = Number(servings)
      const sv = servings.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null
      const m = Number(minutes)
      const mins = minutes.trim() && Number.isFinite(m) && m > 0 ? Math.round(m) : null
      await api.recipes.create({
        title: title.trim() || null,
        servings: sv,
        sourceUrl: preview?.sourceUrl ?? null,
        sourceType: preview?.source ?? 'text',
        imageUrl: preview?.imageUrl ?? null,
        difficulty,
        totalMinutes: mins,
        ingredients,
        steps,
      })
      navigate('/recipes')
    } catch (e) {
      if (e instanceof ApiError) setImportError(e.message)
      else throw e
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Rezept importieren</h1>
        <span className="sub">Aus Instagram, Blogs oder per eingefügtem Text.</span>
      </header>

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
            „Rezept zu Tellerwert" in Instagrams Teilen-Menü.
          </p>
          <a className="btn btn-primary btn-sm" href={SHORTCUT_URL} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
            <IconShare /> Kurzbefehl hinzufügen
          </a>
          <label className="hint-check">
            <input type="checkbox" onChange={(e) => { if (e.target.checked) dismissHint() }} />
            Eingerichtet – diesen Hinweis ausblenden
          </label>
        </div>
      )}

      <div className="card pad-lg stack">
        <div className="seg" role="group" aria-label="Importquelle">
          <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Text einfügen</button>
          <button type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Link</button>
        </div>
        {mode === 'link' ? (
          <div className="field">
            <label htmlFor="rec-url">Rezept-Link</label>
            <input id="rec-url" type="text" inputMode="url" autoCapitalize="none" placeholder="https://… (Instagram, Blog, Webseite)" value={input} onChange={(e) => setInput(e.target.value)} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="rec-text">Rezept-Text / Caption</label>
            <textarea id="rec-text" rows={6} placeholder={'Titel, Zutaten und Zubereitung hier einfügen…'} value={input} onChange={(e) => setInput(e.target.value)} />
          </div>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={handleImport} disabled={importing || !input.trim()}>
          {importing ? <><span className="spinner" /> Importieren…</> : <><IconWand /> Importieren</>}
        </button>
      </div>

      {preview && (
        <div className="card pad-lg stack">
          <h2 className="section-title">Vorschau</h2>
          {preview.imageUrl && (
            <img className="preview-img" src={preview.imageUrl} alt="" loading="lazy" />
          )}
          <div className="field">
            <label htmlFor="prev-title">Titel</label>
            <input id="prev-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rezeptname" />
          </div>
          <div className="row-2">
            <div className="field">
              <label htmlFor="prev-serv">Portionen</label>
              <input id="prev-serv" type="number" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="z. B. 4" />
            </div>
            <div className="field">
              <label htmlFor="prev-min">Zeit (Min.)</label>
              <input id="prev-min" type="number" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="z. B. 30" />
            </div>
          </div>
          <div className="field">
            <span className="label">Schwierigkeit</span>
            <div className="seg" role="group" aria-label="Schwierigkeit">
              {DIFFICULTIES.map((d) => (
                <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => setDifficulty(difficulty === d ? null : d)} style={{ textTransform: 'capitalize' }}>{d}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Zutaten ({ingredients.length})</span>
            <ul className="list">
              {ingredients.map((ing, i) => (
                <li key={i}>
                  <div className="row-card" style={{ padding: '0.5rem 0.75rem' }}>
                    <span className="row-main"><span className="row-title"><span className="text">{ingredientLine(ing)}</span></span></span>
                    <button type="button" className="btn btn-icon btn-ghost btn-sm" aria-label="Zutat entfernen" onClick={() => setIngredients((p) => p.filter((_, j) => j !== i))}><IconClose /></button>
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
                  <li key={i}>{s} <button type="button" className="btn btn-icon btn-ghost btn-sm" aria-label="Schritt entfernen" style={{ verticalAlign: 'middle' }} onClick={() => setSteps((p) => p.filter((_, j) => j !== i))}><IconClose /></button></li>
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
    </div>
  )
}
