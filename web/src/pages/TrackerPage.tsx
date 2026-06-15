import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { Daytime, DiaryDay, DiaryEntry, DiaryLogResult, FoodMatchLine, FoodSummary } from '../api/types'
import { DAYTIME_LABELS, defaultDaytime } from '../lib/daytime'
import { round } from '../lib/nutrition'
import { isNativeApp, scanBarcode } from '../lib/barcode'
import { addDays, dayLabel, todayStr } from '../lib/dates'
import { initHealthSync, pushDayToHealth } from '../lib/health'
import { pushLiveActivity } from '../lib/live-activity'
import { refreshWidgets } from '../lib/shared-auth'
import { FoodRow } from '../components/FoodRow'
import { CalendarSheet } from '../components/CalendarSheet'
import { CustomFoodSheet } from '../components/CustomFoodSheet'
import { IconWand, IconCheck, IconCheckCircle, IconAlert, IconBookmark, IconClose, IconScan, IconFlame, IconSteps, IconDrop, IconCalendar, IconChevronLeft, IconChevronRight, IconPlus, IconBook, IconCoffee, IconPlate, IconMoon, IconApple } from '../components/icons'

interface RowState {
  foodId: string
  grams: number
}

let _rowSeq = 0
const nextKey = (): string => `row-${_rowSeq++}`

const DAYTIME_ORDER: Daytime[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** Volle Mahlzeiten-Namen für die Tagebuch-Liste (die kurzen Labels bleiben im Seg-Control). */
const MEAL_TITLES: Record<Daytime, string> = {
  breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snack: 'Snacks',
}

/** Richtwert-Anteil am Tagesbudget pro Mahlzeit (Yazio-üblich: 25/35/30/10). */
const MEAL_SHARE: Record<Daytime, number> = {
  breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1,
}

const MEAL_ICONS: Record<Daytime, typeof IconCoffee> = {
  breakfast: IconCoffee, lunch: IconPlate, dinner: IconMoon, snack: IconApple,
}

/** Gewählte Mahlzeit übersteht den Umweg über Rezept-/Preset-Seite. */
const PENDING_DAYTIME_KEY = 'eazio.pendingDaytime'

export function TrackerPage() {
  const seeded = (useLocation().state as { presetText?: string } | null)?.presetText ?? ''
  const navigate = useNavigate()
  const [day, setDay] = useState<DiaryDay | null>(null)
  const [date, setDate] = useState(todayStr())
  const [calOpen, setCalOpen] = useState(false)
  const dateRef = useRef(date)
  dateRef.current = date
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const [text, setText] = useState('')
  const [matching, setMatching] = useState(false)
  const [lines, setLines] = useState<FoodMatchLine[]>([])
  const [rows, setRows] = useState<RowState[]>([])
  const [keys, setKeys] = useState<string[]>([])
  const [daytime, setDaytime] = useState<Daytime>(defaultDaytime())
  const [logging, setLogging] = useState(false)
  const [logResult, setLogResult] = useState<DiaryLogResult | null>(null)
  const [undone, setUndone] = useState(false)
  const [presetSaved, setPresetSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [createBarcode, setCreateBarcode] = useState<string | null>(null)
  const [addMenuFor, setAddMenuFor] = useState<Daytime | null>(null)
  const [expanded, setExpanded] = useState<Daytime | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const autoMatched = useRef(false)

  const refreshDay = () => {
    api.diary.day(dateRef.current)
      .then((d) => {
        setDay(d)
        pushLiveActivity(d) // Tagesbilanz auf Lock Screen / Dynamic Island
        // Mahlzeiten & Wasser zurück nach Apple Health (Tages-Abgleich)
        pushDayToHealth({
          date: d.date,
          kcal: d.totals.kcal,
          protein: d.totals.protein,
          fat: d.totals.fat,
          carbs: d.totals.carbs,
          waterMl: d.water.totalMl,
        })
      })
      .catch((e) => { if (e instanceof ApiError) setError(e.message); else throw e })
    refreshWidgets() // keep the home-screen widget in sync with diary writes
  }

  useEffect(() => {
    refreshDay()
  }, [date])

  useEffect(() => {
    initHealthSync(refreshDay) // Apple Health → Server → Tagesansicht aktualisieren
  }, [])

  // Wischgesten: links/rechts wechselt den Tag (vertikales Scrollen gewinnt)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t) touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 2) return
    setDate((d) => addDays(d, dx < 0 ? 1 : -1))
  }

  const matchText = async (input: string) => {
    if (!input.trim()) return
    setError(null)
    setLogResult(null)
    setUndone(false)
    setPresetSaved(false)
    setMatching(true)
    try {
      const res = await api.foods.match(input)
      // append to whatever is already staged (e.g. gescannte Produkte) —
      // the list only empties on Loggen, manuelles Entfernen oder Leeren
      setLines((prev) => [...prev, ...res.lines])
      setKeys((prev) => [...prev, ...res.lines.map(() => nextKey())])
      setRows((prev) => [
        ...prev,
        ...res.lines.map((l) => ({
          foodId: l.selectedFoodId ?? l.candidates[0]?.id ?? '',
          grams: l.suggestedAmountG,
        })),
      ])
      setText('') // matched — das Feld ist frei für weitere Zutaten
      setComposerOpen(false) // Sheet zu, damit die gematchte Liste sichtbar wird
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        // Auto-Match fehlgeschlagen — Text in den Editor retten statt verwerfen
        setText(input)
        setComposerOpen(true)
      } else {
        throw e
      }
    } finally {
      setMatching(false)
    }
  }

  const handleMatch = () => matchText(text)

  // Rezept/Preset „In den Tracker“ → direkt matchen, kein extra Matchen-Klick
  useEffect(() => {
    if (!seeded.trim() || autoMatched.current) return
    autoMatched.current = true
    const pending = sessionStorage.getItem(PENDING_DAYTIME_KEY) as Daytime | null
    sessionStorage.removeItem(PENDING_DAYTIME_KEY)
    if (pending && DAYTIME_ORDER.includes(pending)) setDaytime(pending)
    void matchText(seeded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Produkt (Scan oder frisch angelegt) in die Staging-Liste übernehmen. */
  const stageFood = (food: FoodSummary) => {
    const suggested = food.servings[0]?.grams ?? 100
    const line: FoodMatchLine = {
      raw: food.brand ? `${food.name} – ${food.brand}` : food.name,
      name: food.name,
      qty: null,
      unit: 'serving',
      amountGrams: null,
      suggestedAmountG: suggested,
      candidates: [food],
      selectedFoodId: food.id,
    }
    setLines((prev) => [...prev, line])
    setKeys((prev) => [...prev, nextKey()])
    setRows((prev) => [...prev, { foodId: food.id, grams: suggested }])
    setComposerOpen(false) // Sheet zu, das Produkt steht in der Liste
  }

  const handleScan = async () => {
    const code = await scanBarcode()
    if (!code) return
    setError(null)
    if (!/^\d{8}$|^\d{13}$/.test(code)) {
      setError('Kein Lebensmittel-Barcode erkannt.')
      return
    }
    try {
      stageFood(await api.foods.barcode(code))
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) {
          // unbekanntes Produkt → direkt als eigenes Lebensmittel anlegen
          setComposerOpen(false)
          setCreateBarcode(code)
        } else {
          setError(
            e.status === 503
              ? 'Produktdatenbank gerade nicht erreichbar – später nochmal versuchen.'
              : e.message,
          )
        }
      } else {
        setError('Scan fehlgeschlagen.')
      }
    }
  }

  const handleReset = () => {
    setLines([])
    setRows([])
    setKeys([])
  }

  const handleRowChange = (index: number, value: RowState) => {
    setRows((prev) => prev.map((r, i) => (i === index ? value : r)))
  }

  const handleRowRemove = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
    setRows((prev) => prev.filter((_, i) => i !== index))
    setKeys((prev) => prev.filter((_, i) => i !== index))
  }

  const handleResearch = async (index: number, query: string) => {
    setError(null)
    try {
      const { results } = await api.foods.search(query)
      setLines((prev) => prev.map((l, i) => (i === index ? { ...l, candidates: results } : l)))
      setRows((prev) => prev.map((r, i) => (
        i === index
          ? { foodId: results[0]?.id ?? '', grams: r.grams > 0 ? r.grams : (results[0]?.servings[0]?.grams ?? 100) }
          : r
      )))
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  const loggableRows = rows
    .map((r, i) => ({ ...r, line: lines[i] }))
    .filter((r) => r.foodId && r.grams > 0)

  const handleLog = async () => {
    if (loggableRows.length === 0 || logging) return
    setError(null)
    setLogging(true)
    try {
      const result = await api.diary.log({
        date,
        daytime,
        lines: loggableRows.map((r) => ({
          foodId: r.foodId,
          amountG: r.grams,
          rawText: r.line?.name,
        })),
      })
      setLogResult(result)
      setUndone(false)
      setLines([])
      setRows([])
      setKeys([])
      setText('')
      setComposerOpen(false)
      refreshDay()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    } finally {
      setLogging(false)
    }
  }

  const handleUndo = async () => {
    if (!logResult) return
    try {
      await Promise.all(logResult.entries.map((en) => api.diary.removeEntry(en.id)))
      setLogResult(null)
      setUndone(true)
      refreshDay()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  const handleDeleteEntry = async (id: string) => {
    try {
      await api.diary.removeEntry(id)
      refreshDay()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  const handleWater = async (ml: number) => {
    try {
      await api.diary.addWater(ml, date)
      refreshDay()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  const handleWaterUndo = async () => {
    const last = day?.water.entries[day.water.entries.length - 1]
    if (!last) return
    try {
      await api.diary.removeWater(last.id)
      refreshDay()
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  const handleSavePreset = async () => {
    const name = window.prompt('Name des Presets?')
    if (!name) return
    try {
      await api.presets.create(
        name,
        loggableRows.map((r) => ({
          rawText: r.line?.raw ?? '',
          productId: r.foodId,
          amountG: r.grams,
          serving: null,
          servingQuantity: null,
        })),
      )
      setPresetSaved(true)
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  // Plus-Modal: Zutaten öffnet den Editor hier, Rezept/Preset merken sich die
  // Mahlzeit über sessionStorage und kommen mit presetText zurück.
  const chooseIngredients = (dt: Daytime) => {
    setDaytime(dt)
    setAddMenuFor(null)
    setComposerOpen(true)
    requestAnimationFrame(() => composerRef.current?.focus())
  }
  const chooseRecipe = (dt: Daytime) => {
    sessionStorage.setItem(PENDING_DAYTIME_KEY, dt)
    void navigate('/recipes')
  }
  const choosePreset = (dt: Daytime) => {
    sessionStorage.setItem(PENDING_DAYTIME_KEY, dt)
    void navigate('/presets')
  }

  // Review totals across matched rows (per-100g values × grams).
  const reviewTotals = loggableRows.reduce(
    (acc, r) => {
      const cand = r.line?.candidates.find((c) => c.id === r.foodId)
      if (!cand) return acc
      const f = r.grams / 100
      return {
        kcal: acc.kcal + cand.kcal * f,
        carb: acc.carb + (cand.carbs ?? 0) * f,
        protein: acc.protein + (cand.protein ?? 0) * f,
        fat: acc.fat + (cand.fat ?? 0) * f,
      }
    },
    { kcal: 0, carb: 0, protein: 0, fat: 0 },
  )

  const meals = DAYTIME_ORDER.map((dt) => {
    const entries = (day?.entries ?? []).filter((e) => e.daytime === dt)
    return {
      daytime: dt,
      entries,
      kcal: Math.round(entries.reduce((s, e) => s + e.kcal, 0)),
      budget: day ? Math.round(day.goals.kcalTarget * MEAL_SHARE[dt]) : null,
    }
  })

  // Opted-in active calories extend the day's budget — the "übrig" number already
  // counts them (server: remainingKcal = kcalTarget + countedKcal - consumed), so the
  // shown total and the progress bar must use the same extended budget to stay in sync.
  const dayBudget = day ? day.goals.kcalTarget + (day.activity?.countedKcal ?? 0) : 0

  return (
    <div className="page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="page-head diary-head">
        <div className="diary-head-row">
          <h1>Tagebuch</h1>
          <button
            type="button"
            className="cal-open"
            onClick={() => setCalOpen(true)}
            aria-label="Kalender öffnen"
          >
            <IconCalendar />
          </button>
        </div>
        <div className="diary-datenav">
          <button type="button" className="datenav-btn" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Voriger Tag">
            <IconChevronLeft />
          </button>
          <button type="button" className="datenav-label" onClick={() => setCalOpen(true)}>
            {dayLabel(date)}
          </button>
          <button type="button" className="datenav-btn" onClick={() => setDate((d) => addDays(d, 1))} aria-label="Nächster Tag">
            <IconChevronRight />
          </button>
        </div>
        <span className="sub">
          {day && day.streak.currentStreak > 1
            ? <><IconFlame className="inline-ico" /> {day.streak.currentStreak} Tage in Folge</>
            : 'Mahlzeiten eintippen und loggen.'}
        </span>
      </header>

      {error && (
        <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
      )}

      {day && (
        <div className="totals totals-day">
          <div className="totals-row">
            <div className="kcal-big">
              <span className="n">{Math.max(0, day.remainingKcal)}</span>
              <span className="l">kcal übrig von {dayBudget}</span>
            </div>
            <div className="macro-mini">
              <div><span className="mn">{round(day.totals.carbs)}</span><span className="ml">KH</span></div>
              <div><span className="mn">{round(day.totals.protein)}</span><span className="ml">Protein</span></div>
              <div><span className="mn">{round(day.totals.fat)}</span><span className="ml">Fett</span></div>
            </div>
          </div>
          <div className="kcal-progress" aria-hidden="true">
            <span
              className={day.totals.kcal > dayBudget ? 'over' : undefined}
              style={{ width: `${Math.min(100, (day.totals.kcal / dayBudget) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {day?.activity && (day.activity.steps !== null || day.activity.activeKcal !== null) && (
        <div className="stat-grid">
          {day.activity.steps !== null && (
            <div className="stat-tile">
              <span className="stat-ico steps"><IconSteps /></span>
              <span className="stat-text">
                <span className="stat-val">{day.activity.steps.toLocaleString('de-DE')}</span>
                <span className="stat-lbl">Schritte heute</span>
              </span>
            </div>
          )}
          {day.activity.activeKcal !== null && (
            <div className="stat-tile">
              <span className="stat-ico flame"><IconFlame /></span>
              <span className="stat-text">
                <span className="stat-val">{Math.round(day.activity.activeKcal)} kcal</span>
                <span className="stat-lbl">{day.activity.countedKcal > 0 ? 'aktiv · im Budget' : 'aktiv verbrannt'}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {day && (
        <div className="card water-card">
          <span className="stat-ico water"><IconDrop /></span>
          <span className="stat-text">
            <span className="stat-val">{day.water.totalMl.toLocaleString('de-DE')} ml</span>
            <span className="stat-lbl">von {day.goals.waterMl.toLocaleString('de-DE')} ml Wasser</span>
          </span>
          <div className="btn-row">
            <button type="button" className="btn btn-soft btn-sm" onClick={() => { void handleWater(250) }}>+250</button>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => { void handleWater(500) }}>+500</button>
            {day.water.entries.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void handleWaterUndo() }} aria-label="Letztes Wasser entfernen">
                −
              </button>
            )}
          </div>
        </div>
      )}

      <h2 className="section-title">Mahlzeiten</h2>
      <div className="stack">
        {meals.map((m) => {
          const MealIcon = MEAL_ICONS[m.daytime]
          const open = expanded === m.daytime
          return (
            <div key={m.daytime} className="card meal-row">
              <div className="meal-head">
                <button
                  type="button"
                  className="meal-main"
                  onClick={() => setExpanded(open ? null : m.daytime)}
                  disabled={m.entries.length === 0}
                  aria-expanded={open}
                >
                  <span className={`meal-ico ${m.daytime}`}><MealIcon /></span>
                  <span className="meal-text">
                    <span className="meal-title">
                      {MEAL_TITLES[m.daytime]}
                      <span className="meal-kcal">
                        {m.kcal}{m.budget !== null ? ` / ${m.budget}` : ''} kcal
                      </span>
                    </span>
                    <span className="meal-sub">
                      {m.entries.length > 0
                        ? m.entries.map((e) => e.nameSnapshot).join(', ')
                        : 'Noch nichts getrackt'}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="meal-add"
                  onClick={() => setAddMenuFor(m.daytime)}
                  aria-label={`Zu ${MEAL_TITLES[m.daytime]} hinzufügen`}
                >
                  <IconPlus />
                </button>
              </div>
              {open && m.entries.length > 0 && (
                <ul className="diary-list meal-entries">
                  {m.entries.map((entry: DiaryEntry) => (
                    <li key={entry.id} className="diary-item">
                      <span className="diary-name">{entry.nameSnapshot}</span>
                      <span className="diary-meta">
                        {entry.amountG > 1 ? `${round(entry.amountG)} g · ` : ''}{Math.round(entry.kcal)} kcal
                        {entry.mirrorStatus === 'failed' ? ' · ⚠︎ Yazio' : ''}
                      </span>
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost btn-sm"
                        onClick={() => { void handleDeleteEntry(entry.id) }}
                        aria-label="Eintrag löschen"
                        title="Löschen"
                      >
                        <IconClose />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {matching && lines.length === 0 && !composerOpen && (
        <div className="card pad-lg meal-matching">
          <IconWand className="inline-ico" /> Zutaten werden gematcht…
        </div>
      )}

      {composerOpen && createPortal(
        <div className="cal-overlay" onClick={() => setComposerOpen(false)} role="presentation">
          <div className="add-sheet composer-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Zutaten tracken">
            <div className="add-sheet-head">
              <h3>Zutaten für {MEAL_TITLES[daytime]}</h3>
              <button
                type="button"
                className="btn btn-icon btn-ghost btn-sm"
                onClick={() => setComposerOpen(false)}
                aria-label="Schließen"
              >
                <IconClose />
              </button>
            </div>
            {error && (
              <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
            )}
            <textarea
              id="tracker-text"
              ref={composerRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={'z. B.\n80g Haferflocken\n200ml Milch\n1 Banane'}
            />
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={() => { void handleMatch() }}
                disabled={matching || !text.trim()}
              >
                <IconWand />
                {matching ? 'Matchen…' : 'Matchen'}
              </button>
              {isNativeApp() && (
                <button
                  type="button"
                  className="btn btn-soft btn-lg"
                  onClick={() => { void handleScan() }}
                  aria-label="Barcode scannen"
                  title="Barcode scannen"
                >
                  <IconScan />
                  Scannen
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {lines.length > 0 && (
        <>
          <div className="totals">
            <div className="kcal-big">
              <span className="n">{Math.round(reviewTotals.kcal)}</span>
              <span className="l">kcal gesamt</span>
            </div>
            <div className="macro-mini">
              <div><span className="mn">{round(reviewTotals.carb)}</span><span className="ml">KH</span></div>
              <div><span className="mn">{round(reviewTotals.protein)}</span><span className="ml">Protein</span></div>
              <div><span className="mn">{round(reviewTotals.fat)}</span><span className="ml">Fett</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="section-title">Zutaten</h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleReset}
              aria-label="Liste leeren"
            >
              <IconClose /> Leeren
            </button>
          </div>
          <div className="stack">
            {lines.map((line, i) => (
              <FoodRow
                key={keys[i] ?? i}
                line={line}
                value={rows[i] ?? { foodId: '', grams: 0 }}
                onChange={(v) => handleRowChange(i, v)}
                onRemove={() => handleRowRemove(i)}
                onResearch={(q) => handleResearch(i, q)}
              />
            ))}
          </div>

          <div className="card stack">
            <div className="field">
              <span className="label">Mahlzeit</span>
              <div className="seg" role="group" aria-label="Mahlzeit">
                {(Object.entries(DAYTIME_LABELS) as [Daytime, string][]).map(([key, lbl]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={daytime === key}
                    onClick={() => setDaytime(key)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => { void handleLog() }}
                disabled={loggableRows.length === 0 || logging || matching}
              >
                <IconCheck />
                {logging ? 'Loggen…' : `Als ${DAYTIME_LABELS[daytime]} loggen`}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { void handleSavePreset() }}
                disabled={loggableRows.length === 0}
              >
                <IconBookmark />
                Preset
              </button>
            </div>
          </div>
        </>
      )}

      {logResult && !undone && (
        <div className="banner success">
          <IconCheckCircle />
          <span className="banner-text">
            {logResult.entries.length} {logResult.entries.length === 1 ? 'Eintrag' : 'Einträge'} als{' '}
            {DAYTIME_LABELS[logResult.daytime]} geloggt
            {logResult.mirrorQueued ? ' · wird zu Yazio gespiegelt' : ''}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void handleUndo() }}>
            Rückgängig
          </button>
        </div>
      )}

      {undone && <p className="muted">Rückgängig gemacht.</p>}

      {presetSaved && (
        <p className="banner success"><IconCheck /><span className="banner-text">Preset gespeichert.</span></p>
      )}

      {addMenuFor && createPortal(
        <div className="cal-overlay" onClick={() => setAddMenuFor(null)} role="presentation">
          <div className="add-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${MEAL_TITLES[addMenuFor]} tracken`}>
            <div className="add-sheet-head">
              <h3>{MEAL_TITLES[addMenuFor]}</h3>
              <button
                type="button"
                className="btn btn-icon btn-ghost btn-sm"
                onClick={() => setAddMenuFor(null)}
                aria-label="Schließen"
              >
                <IconClose />
              </button>
            </div>
            <button type="button" className="add-option" onClick={() => chooseIngredients(addMenuFor)}>
              <span className="add-option-ico ingredients"><IconWand /></span>
              <span className="add-option-text">
                <strong>Zutaten tracken</strong>
                <span>Freitext eintippen oder Barcode scannen</span>
              </span>
              <IconChevronRight className="add-option-chev" />
            </button>
            <button type="button" className="add-option" onClick={() => chooseRecipe(addMenuFor)}>
              <span className="add-option-ico recipe"><IconBook /></span>
              <span className="add-option-text">
                <strong>Rezept tracken</strong>
                <span>Aus deinen gespeicherten Rezepten</span>
              </span>
              <IconChevronRight className="add-option-chev" />
            </button>
            <button type="button" className="add-option" onClick={() => choosePreset(addMenuFor)}>
              <span className="add-option-ico preset"><IconBookmark /></span>
              <span className="add-option-text">
                <strong>Preset tracken</strong>
                <span>Gespeicherte Kombination erneut loggen</span>
              </span>
              <IconChevronRight className="add-option-chev" />
            </button>
          </div>
        </div>,
        document.body,
      )}
      {createBarcode && (
        <CustomFoodSheet
          barcode={createBarcode}
          onCreated={(food) => { setCreateBarcode(null); stageFood(food) }}
          onClose={() => setCreateBarcode(null)}
        />
      )}
      {calOpen && (
        <CalendarSheet
          selected={date}
          streak={day?.streak ?? null}
          onPick={setDate}
          onClose={() => setCalOpen(false)}
        />
      )}
    </div>
  )
}
