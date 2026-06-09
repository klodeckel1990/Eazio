import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { Account, Daytime, LogResult, MatchLine } from '../api/types'
import { DAYTIME_LABELS, defaultDaytime } from '../lib/daytime'
import { scaleNutrition, round } from '../lib/nutrition'
import { IngredientRow } from '../components/IngredientRow'
import { IconUser, IconWand, IconCheck, IconCheckCircle, IconAlert, IconBookmark } from '../components/icons'

interface RowState {
  productId: string
  grams: number
}

let _rowSeq = 0
const nextKey = (): string => `row-${_rowSeq++}`

export function TrackerPage() {
  const seeded = (useLocation().state as { presetText?: string } | null)?.presetText ?? ''
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [text, setText] = useState(seeded)
  const [matching, setMatching] = useState(false)
  const [lines, setLines] = useState<MatchLine[]>([])
  const [rows, setRows] = useState<RowState[]>([])
  const [keys, setKeys] = useState<string[]>([])
  const [daytime, setDaytime] = useState<Daytime>(defaultDaytime())
  const [logging, setLogging] = useState(false)
  const [logResult, setLogResult] = useState<LogResult | null>(null)
  const [undone, setUndone] = useState(false)
  const [presetSaved, setPresetSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load accounts on mount
  useEffect(() => {
    api.accounts.list()
      .then(accs => {
        setAccounts(accs)
        const def = accs.find(a => a.isDefault) ?? accs[0]
        setSelectedAccountId(def?.id ?? '')
      })
      .catch(e => {
        if (e instanceof ApiError) {
          setError(e.message)
        } else {
          throw e
        }
      })
  }, [])

  // No accounts loaded yet — loading state
  if (accounts === null) {
    return (
      <div className="page">
        <p className="loading-inline"><span className="spinner" /> Lade Konten…</p>
      </div>
    )
  }

  // No accounts linked
  if (accounts.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Tracker</h1>
        </header>
        <div className="empty">
          <span className="emoji"><IconUser /></span>
          <h3>Kein Konto verknüpft</h3>
          <p>Verbinde zuerst dein Yazio-Konto, dann kannst du hier tracken.</p>
          <Link to="/accounts" className="btn btn-primary" style={{ marginTop: '0.4rem' }}>
            Zu den Konten
          </Link>
        </div>
      </div>
    )
  }

  const handleMatch = async () => {
    if (!text.trim()) return
    setError(null)
    setLogResult(null)
    setUndone(false)
    setPresetSaved(false)
    setMatching(true)
    try {
      const res = await api.match(text, selectedAccountId || undefined)
      setLines(res.lines)
      setKeys(res.lines.map(() => nextKey()))
      setRows(res.lines.map(l => {
        const sel = l.selectedProductId
          ? l.candidates.find(c => c.productId === l.selectedProductId)
          : l.candidates[0]
        return {
          productId: sel?.productId ?? '',
          grams: l.amountGrams ?? sel?.referenceAmount ?? 0,
        }
      }))
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409) {
          setError('Kein Yazio-Konto verknüpft. Bitte zuerst ein Konto unter Konten hinzufügen.')
        } else {
          setError(e.message)
        }
      } else {
        throw e
      }
    } finally {
      setMatching(false)
    }
  }

  const handleRowChange = (index: number, value: RowState) => {
    setRows(prev => prev.map((r, i) => i === index ? value : r))
  }

  const handleRowRemove = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index))
    setRows(prev => prev.filter((_, i) => i !== index))
    setKeys(prev => prev.filter((_, i) => i !== index))
  }

  const handleLog = async () => {
    if (rows.length === 0 || logging) return
    setError(null)
    setLogging(true)
    try {
      const result = await api.log({
        accountId: selectedAccountId || undefined,
        daytime,
        lines: rows.map((r, i) => ({
          productId: r.productId,
          name: lines[i]?.name ?? '',
          amountGrams: r.grams,
        })),
      })
      setLogResult(result)
      setUndone(false)
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        throw e
      }
    } finally {
      setLogging(false)
    }
  }

  const handleUndo = async () => {
    if (!logResult) return
    try {
      await api.undo(logResult.logId)
      setLogResult(null)
      setUndone(true)
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        throw e
      }
    }
  }

  const handleSavePreset = async () => {
    const name = window.prompt('Name des Presets?')
    if (!name) return
    try {
      await api.presets.create(
        name,
        rows.map((r, i) => ({
          rawText: lines[i]?.raw ?? '',
          productId: r.productId,
          amountG: r.grams,
          serving: null,
          servingQuantity: null,
        })),
      )
      setPresetSaved(true)
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        throw e
      }
    }
  }

  // Running totals across all matched rows.
  const totals = rows.reduce(
    (acc, r, i) => {
      const cand = lines[i]?.candidates.find(c => c.productId === r.productId)
      if (!cand) return acc
      const nn = scaleNutrition(cand.nutrientsPerReference, cand.referenceAmount, r.grams)
      return {
        kcal: acc.kcal + nn.kcal,
        carb: acc.carb + nn.carb,
        protein: acc.protein + nn.protein,
        fat: acc.fat + nn.fat,
      }
    },
    { kcal: 0, carb: 0, protein: 0, fat: 0 },
  )

  return (
    <div className="page">
      <header className="page-head">
        <h1>Tracker</h1>
        <span className="sub">Zutaten eintippen, matchen, in Yazio loggen.</span>
      </header>

      {error && (
        <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>
      )}

      <div className="card pad-lg stack">
        <div className="field">
          <label htmlFor="tracker-text">Zutaten</label>
          <textarea
            id="tracker-text"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={5}
            placeholder={'z. B.\n80g Haferflocken\n200ml Milch\n1 Banane'}
          />
        </div>

        {accounts.length > 1 && (
          <div className="field">
            <label htmlFor="account-select">Konto</label>
            <select
              id="account-select"
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.label} ({a.yazioUsername})</option>
              ))}
            </select>
          </div>
        )}

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
              <span className="n">{Math.round(totals.kcal)}</span>
              <span className="l">kcal gesamt</span>
            </div>
            <div className="macro-mini">
              <div><span className="mn">{round(totals.carb)}</span><span className="ml">KH</span></div>
              <div><span className="mn">{round(totals.protein)}</span><span className="ml">Protein</span></div>
              <div><span className="mn">{round(totals.fat)}</span><span className="ml">Fett</span></div>
            </div>
          </div>

          <h2 className="section-title">Zutaten</h2>
          <div className="stack">
            {lines.map((line, i) => (
              <IngredientRow
                key={keys[i] ?? i}
                line={line}
                value={rows[i] ?? { productId: '', grams: 0 }}
                onChange={v => handleRowChange(i, v)}
                onRemove={() => handleRowRemove(i)}
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
                disabled={rows.length === 0 || logging || matching}
              >
                <IconCheck />
                {logging ? 'Loggen…' : `Als ${DAYTIME_LABELS[daytime]} loggen`}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { void handleSavePreset() }}
                disabled={rows.length === 0}
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
            {logResult.count} {logResult.count === 1 ? 'Eintrag' : 'Einträge'} als {DAYTIME_LABELS[logResult.daytime]} geloggt
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
    </div>
  )
}
