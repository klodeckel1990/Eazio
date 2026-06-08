import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { Account, Daytime, LogResult, MatchLine } from '../api/types'
import { DAYTIME_LABELS, defaultDaytime } from '../lib/daytime'
import { IngredientRow } from '../components/IngredientRow'

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
    return <div className="container"><p>Lade Konten…</p></div>
  }

  // No accounts linked
  if (accounts.length === 0) {
    return (
      <div className="container">
        <p>Bitte zuerst ein Yazio-Konto verknüpfen.</p>
        <Link to="/accounts">Zu den Konten</Link>
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

  return (
    <div className="container">
      <h2>Tracker</h2>

      {error && <p className="error">{error}</p>}

      <div>
        <label htmlFor="tracker-text">Zutaten</label>
        <textarea
          id="tracker-text"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          style={{ display: 'block', width: '100%' }}
        />
      </div>

      {accounts.length > 1 && (
        <div>
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

      <button type="button" onClick={() => { void handleMatch() }} disabled={matching}>
        {matching ? 'Matchen…' : 'Matchen'}
      </button>

      {lines.length > 0 && (
        <div>
          <h3>Zutaten</h3>
          {lines.map((line, i) => (
            <IngredientRow
              key={keys[i] ?? i}
              line={line}
              value={rows[i] ?? { productId: '', grams: 0 }}
              onChange={v => handleRowChange(i, v)}
              onRemove={() => handleRowRemove(i)}
            />
          ))}

          <div>
            <label htmlFor="daytime-select">Mahlzeit</label>
            <select
              id="daytime-select"
              value={daytime}
              onChange={e => setDaytime(e.target.value as Daytime)}
            >
              {(Object.entries(DAYTIME_LABELS) as [Daytime, string][]).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => { void handleLog() }}
            disabled={rows.length === 0 || logging || matching}
          >
            {logging ? 'Loggen…' : 'Loggen'}
          </button>

          <button
            type="button"
            onClick={() => { void handleSavePreset() }}
            disabled={rows.length === 0}
          >
            Als Preset speichern
          </button>
        </div>
      )}

      {logResult && !undone && (
        <div>
          <p>
            ✓ {logResult.count} Einträge als {DAYTIME_LABELS[logResult.daytime]} geloggt
          </p>
          <button type="button" onClick={() => { void handleUndo() }}>
            Rückgängig
          </button>
        </div>
      )}

      {undone && <p className="muted">Rückgängig gemacht</p>}

      {presetSaved && <p className="muted">Preset gespeichert.</p>}
    </div>
  )
}
