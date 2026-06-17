import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { FoodSummary, PantryItem, RecipeMatch, WizardRecipe } from '../api/types'
import { isNativeApp, scanBarcode } from '../lib/barcode'
import { unitOf, dateValue, parseDate, inDays, expiryClass, expiryLabel } from '../lib/pantry'
import { CustomFoodSheet } from './CustomFoodSheet'
import { IconScan, IconSearch, IconClose, IconPlus, IconCheck, IconAlert, IconCalendar, IconTrash, IconChevronRight, IconCheckCircle, IconBook, IconSparkle, IconClock } from './icons'

// ---- geteilte Felder ------------------------------------------------------

function AmountField({ value, onChange, unit, step }: {
  value: number; onChange: (v: number) => void; unit: string; step: number
}) {
  return (
    <div className="stepper pantry-stepper">
      <button type="button" aria-label="weniger" onClick={() => onChange(Math.max(0, Math.round(value - step)))}>−</button>
      <input type="number" inputMode="numeric" min={0} max={100000} value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      <span className="unit">{unit}</span>
      <button type="button" aria-label="mehr" onClick={() => onChange(Math.round(value + step))}>+</button>
    </div>
  )
}

const MHD_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Kein MHD', days: null },
  { label: '1 Woche', days: 7 },
  { label: '1 Monat', days: 30 },
  { label: '6 Monate', days: 182 },
  { label: '1 Jahr', days: 365 },
]

function ExpiryField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="pantry-mhd-field">
      <div className="chip-row">
        {MHD_PRESETS.map((p) => (
          <button key={p.label} type="button" className="chip" aria-pressed={p.days === null && value === null}
            onClick={() => onChange(p.days === null ? null : inDays(p.days))}>
            {p.label}
          </button>
        ))}
      </div>
      <label className={`pantry-date ${expiryClass(value)}`}>
        <IconCalendar />
        <input type="date" value={dateValue(value)} onChange={(e) => onChange(parseDate(e.target.value))} />
        {value != null && <span className="pantry-date-label">{expiryLabel(value)}</span>}
      </label>
    </div>
  )
}

function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="cal-overlay" onClick={onClose} role="presentation">
      <div className="add-sheet composer-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="add-sheet-head">
          <h3>{title}</h3>
          <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>
        <div className="composer-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

// ---- Hinzufügen-Wizard (Einzeln / Batch) ----------------------------------

type Mode = 'single' | 'batch'

export function PantryAddSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<Mode>('single')
  const [queue, setQueue] = useState<FoodSummary[]>([])
  const [phase, setPhase] = useState<'collect' | 'detail'>('collect')
  const [idx, setIdx] = useState(0)
  const [amount, setAmount] = useState(100)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<FoodSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createBarcode, setCreateBarcode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  const initDetail = (food: FoodSummary) => {
    setAmount(Math.round(food.servings[0]?.grams ?? 100))
    setExpiresAt(null)
  }

  const pickFood = (food: FoodSummary) => {
    setError(null); setQ(''); setResults([])
    if (mode === 'batch') {
      setQueue((p) => [...p, food])
    } else {
      setQueue([food]); setIdx(0); initDetail(food); setPhase('detail')
    }
  }

  const handleScan = async () => {
    if (scanning) return
    setScanning(true)
    try {
      const code = await scanBarcode()
      if (!code) return
      setError(null)
      if (!/^\d{8}$|^\d{13}$/.test(code)) { setError('Kein Lebensmittel-Barcode erkannt.'); return }
      try {
        pickFood(await api.foods.barcode(code))
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 404) setCreateBarcode(code)
          else setError(e.status === 503 ? 'Produktdatenbank gerade nicht erreichbar – später nochmal.' : e.message)
        } else setError('Scan fehlgeschlagen.')
      }
    } finally { setScanning(false) }
  }

  const runSearch = async () => {
    if (!q.trim()) return
    setSearching(true); setError(null)
    try { const res = await api.foods.search(q); setResults(res.results) }
    catch (e) { if (e instanceof ApiError) setError(e.message); else throw e }
    finally { setSearching(false) }
  }

  const startDetailFromQueue = () => {
    const first = queue[0]
    if (!first) return
    setIdx(0); initDetail(first); setPhase('detail')
  }

  const saveCurrent = async () => {
    const food = queue[idx]
    if (!food || amount <= 0 || saving) return
    setSaving(true); setError(null)
    try {
      await api.pantry.add([{ foodId: food.id, amountG: Math.round(amount), expiresAt }])
      setSavedCount((c) => c + 1); setLastSaved(food.name)
      const next = queue[idx + 1]
      if (mode === 'batch' && next) {
        setIdx(idx + 1); initDetail(next)
      } else {
        onAdded()
        if (mode === 'batch') onClose()
        else { setQueue([]); setPhase('collect') }
      }
    } catch (e) {
      if (e instanceof ApiError) setError('Speichern fehlgeschlagen.'); else throw e
    } finally { setSaving(false) }
  }

  const food = queue[idx]
  const detailLabel = mode === 'single'
    ? 'In den Vorrat'
    : idx < queue.length - 1 ? `Weiter (${idx + 1}/${queue.length})` : 'Speichern & fertig'

  return (
    <>
      <SheetShell title="Zum Vorrat hinzufügen" onClose={onClose}>
        {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

        {phase === 'collect' ? (
          <>
            <div className="seg pantry-mode" role="group" aria-label="Erfassungsmodus">
              <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>Einzeln</button>
              <button type="button" aria-pressed={mode === 'batch'} onClick={() => setMode('batch')}>Batch</button>
            </div>
            <p className="pantry-mode-hint">
              {mode === 'single'
                ? 'Menge & MHD direkt nach jedem Artikel abfragen.'
                : 'Erst alles scannen, danach Mengen & MHD erfassen.'}
            </p>

            {isNativeApp() && (
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => { void handleScan() }} disabled={scanning}>
                <IconScan /> {scanning ? 'Scanner offen…' : 'Barcode scannen'}
              </button>
            )}

            <div className="pantry-search">
              <input type="search" value={q} placeholder="Lebensmittel suchen…"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch() } }} />
              <button type="button" className="btn btn-soft" onClick={() => { void runSearch() }} disabled={searching || !q.trim()} aria-label="Suchen">
                <IconSearch />
              </button>
            </div>

            {searching && <p className="loading-inline"><span className="spinner" /> Suche…</p>}
            {results.length > 0 && (
              <ul className="list pantry-results">
                {results.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="pantry-result" onClick={() => pickFood(f)}>
                      <span className="pantry-result-info">
                        <span className="pantry-result-name">{f.name}</span>
                        {f.brand && <span className="pantry-result-sub">{f.brand}</span>}
                      </span>
                      <IconPlus />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {mode === 'single' && lastSaved && (
              <p className="pantry-saved"><IconCheck /> {savedCount} hinzugefügt – zuletzt „{lastSaved}". Scanne oder suche den nächsten Artikel.</p>
            )}

            {mode === 'batch' && (
              <div className="pantry-queue">
                <div className="pantry-queue-head">{queue.length} erfasst</div>
                {queue.length > 0 && (
                  <ul className="list">
                    {queue.map((f, i) => (
                      <li key={`${f.id}-${i}`} className="pantry-queue-row">
                        <span className="pantry-queue-name">{f.name}</span>
                        <button type="button" className="btn btn-icon btn-ghost btn-sm" aria-label="Entfernen" onClick={() => setQueue((p) => p.filter((_, xi) => xi !== i))}>
                          <IconClose />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="btn btn-primary btn-lg btn-block" disabled={queue.length === 0} onClick={startDetailFromQueue}>
                  Mengen erfassen ({queue.length})
                </button>
              </div>
            )}
          </>
        ) : food ? (
          <>
            {mode === 'batch' && (
              <div className="pantry-progress">
                <span>Schritt {idx + 1} von {queue.length}</span>
                <div className="pantry-progress-bar"><span style={{ width: `${((idx + 1) / queue.length) * 100}%` }} /></div>
              </div>
            )}
            <div className="pantry-detail-head">
              <span className="pantry-detail-name">{food.name}</span>
              {food.brand && <span className="pantry-detail-sub">{food.brand}</span>}
            </div>

            <label className="pantry-label">Menge</label>
            <AmountField value={amount} onChange={setAmount} unit={unitOf(food)} step={unitOf(food) === 'ml' ? 100 : 50} />

            <label className="pantry-label">Mindesthaltbarkeit (optional)</label>
            <ExpiryField value={expiresAt} onChange={setExpiresAt} />

            <div className="btn-row">
              <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={() => { void saveCurrent() }} disabled={saving || amount <= 0}>
                <IconCheck /> {detailLabel}
              </button>
            </div>
          </>
        ) : null}
      </SheetShell>

      {createBarcode && (
        <CustomFoodSheet
          barcode={createBarcode}
          onCreated={(f) => { setCreateBarcode(null); pickFood(f) }}
          onClose={() => setCreateBarcode(null)}
        />
      )}
    </>
  )
}

// ---- Bearbeiten (Menge / MHD / entfernen) ---------------------------------

export function PantryEditSheet({ item, onClose, onSaved }: {
  item: PantryItem; onClose: () => void; onSaved: () => void
}) {
  const [amount, setAmount] = useState(Math.round(item.amountG))
  const [expiresAt, setExpiresAt] = useState<number | null>(item.expiresAt)
  const [busy, setBusy] = useState(false)
  const unit = unitOf(item)

  const save = async () => {
    if (amount <= 0 || busy) return
    setBusy(true)
    try { await api.pantry.update(item.id, { amountG: amount, expiresAt }) } finally { onSaved(); onClose() }
  }
  const remove = async () => {
    if (busy) return
    setBusy(true)
    try { await api.pantry.remove(item.id) } finally { onSaved(); onClose() }
  }

  return (
    <SheetShell title={item.name} onClose={onClose}>
      <label className="pantry-label">Menge</label>
      <AmountField value={amount} onChange={setAmount} unit={unit} step={unit === 'ml' ? 100 : 50} />

      <label className="pantry-label">Mindesthaltbarkeit (optional)</label>
      <ExpiryField value={expiresAt} onChange={setExpiresAt} />

      <div className="btn-row">
        <button type="button" className="btn btn-ghost btn-danger" onClick={() => { void remove() }} disabled={busy}>
          <IconTrash /> Entfernen
        </button>
        <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={() => { void save() }} disabled={busy || amount <= 0}>
          <IconCheck /> Speichern
        </button>
      </div>
    </SheetShell>
  )
}

// ---- „Was kann ich kochen?" — Rezept-Matches (Premium) --------------------

export function PantryMatchesSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [matches, setMatches] = useState<RecipeMatch[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.pantry.recipeMatches()
      .then((r) => setMatches(r.matches))
      .catch((e) => { if (e instanceof ApiError) setError('Konnte nicht geladen werden.'); else throw e })
  }, [])

  const open = (id: string) => { onClose(); navigate(`/recipes/${id}`) }

  return (
    <SheetShell title="Was kann ich kochen?" onClose={onClose}>
      {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

      {matches === null && !error ? (
        <p className="loading-inline"><span className="spinner" /> Gleiche mit deinem Vorrat ab…</p>
      ) : matches && matches.length === 0 ? (
        <div className="empty">
          <span className="emoji"><IconBook /></span>
          <h3>Noch keine Rezepte</h3>
          <p>Importiere Rezepte – dann zeigen wir dir, welche du aus deinem Vorrat kochen kannst.</p>
        </div>
      ) : (
        <ul className="list pantry-matches">
          {(matches ?? []).map((m) => {
            const complete = m.have === m.total
            const pct = Math.round((m.have / m.total) * 100)
            return (
              <li key={m.recipeId}>
                <button type="button" className={`pantry-match ${complete ? 'is-complete' : ''}`} onClick={() => open(m.recipeId)}>
                  <span className="pantry-match-info">
                    <span className="pantry-match-title">{m.title}</span>
                    <span className="pantry-match-cov">
                      {complete
                        ? <span className="pantry-match-all"><IconCheckCircle /> Alles da!</span>
                        : <>{m.have}/{m.total} Zutaten · fehlt: {m.missing.slice(0, 3).join(', ')}{m.missing.length > 3 ? ` +${m.missing.length - 3}` : ''}</>}
                    </span>
                    <span className="pantry-match-bar"><span className={complete ? 'full' : ''} style={{ width: `${pct}%` }} /></span>
                  </span>
                  <IconChevronRight />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </SheetShell>
  )
}

// ---- KI-Wizard „Rezept aus Vorräten" (Premium) ----------------------------

export function PantryWizardSheet({ itemCount, onClose }: { itemCount: number; onClose: () => void }) {
  const navigate = useNavigate()
  const [style, setStyle] = useState<'lowcarb' | 'normal'>('normal')
  const [taste, setTaste] = useState<'suess' | 'herzhaft'>('herzhaft')
  const [useBudget, setUseBudget] = useState(true)
  const [phase, setPhase] = useState<'config' | 'loading' | 'result'>('config')
  const [recipe, setRecipe] = useState<WizardRecipe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const generate = async () => {
    setPhase('loading'); setError(null)
    try {
      const r = await api.pantry.wizard({ style, taste, useBudget })
      setRecipe(r.recipe); setPhase('result')
    } catch (e) {
      if (e instanceof ApiError) {
        setError(
          e.status === 400 ? 'Dein Vorrat ist leer – leg zuerst Lebensmittel an.'
            : e.status === 503 ? 'KI gerade nicht verfügbar – später nochmal.'
              : 'Rezept konnte nicht erstellt werden – versuch es nochmal.',
        )
      } else setError('Etwas ist schiefgelaufen.')
      setPhase('config')
    }
  }

  const save = async () => {
    if (!recipe || saving) return
    setSaving(true)
    try {
      const summary = await api.recipes.create({
        title: recipe.title,
        servings: recipe.servings,
        sourceUrl: null,
        sourceType: 'text',
        imageUrl: null,
        difficulty: recipe.difficulty,
        totalMinutes: recipe.totalMinutes,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      })
      onClose()
      navigate(`/recipes/${summary.id}`)
    } catch (e) {
      setSaving(false)
      if (e instanceof ApiError) setError('Speichern fehlgeschlagen.'); else throw e
    }
  }

  return (
    <SheetShell title="Koch-Idee aus deinem Vorrat" onClose={onClose}>
      {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

      {phase === 'config' && (
        <>
          {itemCount === 0 && <p className="pantry-mode-hint">Leg zuerst Lebensmittel in den Vorrat – daraus baue ich ein Rezept.</p>}
          <label className="pantry-label">Stil</label>
          <div className="seg" role="group" aria-label="Stil">
            <button type="button" aria-pressed={style === 'normal'} onClick={() => setStyle('normal')}>Normal</button>
            <button type="button" aria-pressed={style === 'lowcarb'} onClick={() => setStyle('lowcarb')}>Low Carb</button>
          </div>
          <label className="pantry-label">Geschmack</label>
          <div className="seg" role="group" aria-label="Geschmack">
            <button type="button" aria-pressed={taste === 'herzhaft'} onClick={() => setTaste('herzhaft')}>Herzhaft</button>
            <button type="button" aria-pressed={taste === 'suess'} onClick={() => setTaste('suess')}>Süß</button>
          </div>
          <label className="pantry-toggle">
            <input type="checkbox" checked={useBudget} onChange={(e) => setUseBudget(e.target.checked)} />
            <span className="pantry-toggle-text">
              <strong>An mein Tagesbudget anpassen</strong>
              <span>Restkalorien &amp; fehlende Makros einbeziehen.</span>
            </span>
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={() => { void generate() }} disabled={itemCount === 0}>
              <IconSparkle /> Rezept erzeugen
            </button>
          </div>
        </>
      )}

      {phase === 'loading' && (
        <div className="match-loading">
          <span className="spinner" />
          <span className="match-loading-title">Ich koche eine Idee aus…</span>
          <span className="match-loading-sub">Gleich hast du ein Rezept aus deinem Vorrat.</span>
        </div>
      )}

      {phase === 'result' && recipe && (
        <div className="wizard-result">
          <h3 className="wizard-title">{recipe.title}</h3>
          <div className="wizard-nutri">
            <span className="wizard-kcal">{recipe.nutrition.kcal} kcal</span>
            <span>E {recipe.nutrition.protein} g</span>
            <span>K {recipe.nutrition.carbs} g</span>
            <span>F {recipe.nutrition.fat} g</span>
            {recipe.totalMinutes != null && <span className="wizard-time"><IconClock /> {recipe.totalMinutes} min</span>}
          </div>
          {recipe.note && <p className="wizard-note">{recipe.note}</p>}

          <h4 className="wizard-sub">Zutaten</h4>
          <ul className="wizard-ings">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {(ing.quantity || ing.unit) && <span className="wi-amt">{[ing.quantity, ing.unit].filter(Boolean).join(' ')}</span>}
                {ing.name}
              </li>
            ))}
          </ul>

          {recipe.steps.length > 0 && (
            <>
              <h4 className="wizard-sub">Zubereitung</h4>
              <ol className="wizard-steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </>
          )}

          <div className="btn-row">
            <button type="button" className="btn btn-soft" onClick={() => { setRecipe(null); setPhase('config') }} disabled={saving}>Neu</button>
            <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={() => { void save() }} disabled={saving}>
              <IconCheck /> Speichern &amp; öffnen
            </button>
          </div>
        </div>
      )}
    </SheetShell>
  )
}
