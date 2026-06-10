import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { Daytime, DiaryDay, DiaryEntry, DiaryLogResult, FoodMatchLine } from '../api/types'
import { DAYTIME_LABELS, defaultDaytime } from '../lib/daytime'
import { round } from '../lib/nutrition'
import { FoodRow } from '../components/FoodRow'
import { IconWand, IconCheck, IconCheckCircle, IconAlert, IconBookmark, IconClose } from '../components/icons'

interface RowState {
  foodId: string
  grams: number
}

let _rowSeq = 0
const nextKey = (): string => `row-${_rowSeq++}`

const DAYTIME_ORDER: Daytime[] = ['breakfast', 'lunch', 'dinner', 'snack']

export function TrackerPage() {
  const seeded = (useLocation().state as { presetText?: string } | null)?.presetText ?? ''
  const [day, setDay] = useState<DiaryDay | null>(null)
  const [text, setText] = useState(seeded)
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

  const refreshDay = () => {
    api.diary.day()
      .then(setDay)
      .catch((e) => { if (e instanceof ApiError) setError(e.message); else throw e })
  }

  useEffect(refreshDay, [])

  const handleMatch = async () => {
    if (!text.trim()) return
    setError(null)
    setLogResult(null)
    setUndone(false)
    setPresetSaved(false)
    setMatching(true)
    try {
      const res = await api.foods.match(text)
      setLines(res.lines)
      setKeys(res.lines.map(() => nextKey()))
      setRows(res.lines.map((l) => ({
        foodId: l.selectedFoodId ?? l.candidates[0]?.id ?? '',
        grams: l.suggestedAmountG,
      })))
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    } finally {
      setMatching(false)
    }
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
      await api.diary.addWater(ml)
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

  const grouped = DAYTIME_ORDER.map((dt) => ({
    daytime: dt,
    entries: (day?.entries ?? []).filter((e) => e.daytime === dt),
  })).filter((g) => g.entries.length > 0)

  return (
    <div className="page">
      <header className="page-head">
        <h1>Tagebuch</h1>
        <span className="sub">
          {day && day.streak.currentStreak > 1
            ? `🔥 ${day.streak.currentStreak} Tage in Folge`
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
              <span className="l">kcal übrig von {day.goals.kcalTarget}</span>
            </div>
            <div className="macro-mini">
              <div><span className="mn">{round(day.totals.carbs)}</span><span className="ml">KH</span></div>
              <div><span className="mn">{round(day.totals.protein)}</span><span className="ml">Protein</span></div>
              <div><span className="mn">{round(day.totals.fat)}</span><span className="ml">Fett</span></div>
            </div>
          </div>
          <div className="kcal-progress" aria-hidden="true">
            <span
              className={day.totals.kcal > day.goals.kcalTarget ? 'over' : undefined}
              style={{ width: `${Math.min(100, (day.totals.kcal / day.goals.kcalTarget) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {day && (
        <div className="card water-card">
          <span className="water-label">💧 {day.water.totalMl} / {day.goals.waterMl} ml</span>
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

      <div className="card pad-lg stack">
        <div className="field">
          <label htmlFor="tracker-text">Zutaten</label>
          <textarea
            id="tracker-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={'z. B.\n80g Haferflocken\n200ml Milch\n1 Banane'}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          onClick={() => { void handleMatch() }}
          disabled={matching || !text.trim()}
        >
          <IconWand />
          {matching ? 'Matchen…' : 'Matchen'}
        </button>
      </div>

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

          <h2 className="section-title">Zutaten</h2>
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

      {grouped.length > 0 && (
        <>
          <h2 className="section-title">Heute</h2>
          <div className="stack">
            {grouped.map((g) => (
              <div key={g.daytime} className="card diary-group">
                <div className="diary-group-head">
                  <h3>{DAYTIME_LABELS[g.daytime]}</h3>
                  <span className="muted">{Math.round(g.entries.reduce((s, e) => s + e.kcal, 0))} kcal</span>
                </div>
                <ul className="diary-list">
                  {g.entries.map((entry: DiaryEntry) => (
                    <li key={entry.id} className="diary-item">
                      <span className="diary-name">{entry.nameSnapshot}</span>
                      <span className="diary-meta">
                        {round(entry.amountG)} g · {Math.round(entry.kcal)} kcal
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
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
