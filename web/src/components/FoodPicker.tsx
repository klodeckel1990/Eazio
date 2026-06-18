import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError } from '../api/client'
import type { FoodMatchLine, FoodSummary } from '../api/types'
import { isNativeApp, scanBarcode } from '../lib/barcode'
import { FoodRow } from './FoodRow'
import { CustomFoodSheet } from './CustomFoodSheet'
import { IconWand, IconScan, IconClose, IconPlus, IconAlert, IconChevronLeft } from './icons'

interface RowState {
  foodId: string
  grams: number
}

let _seq = 0
const nextKey = () => `fp-${_seq++}`

export interface PickedItem {
  rawText: string
  productId: string
  amountG: number
  food?: FoodSummary
}

/**
 * Wiederverwendbarer Lebensmittel-Dialog wie im Tracker: Freitext matchen,
 * Barcode scannen, per Hand suchen — Treffer prüfen/mengen, dann übernehmen.
 * Liefert die gewählten Items via onAdd zurück (kein Diary-/Log-Bezug).
 */
export function FoodPicker({
  onAdd,
  onClose,
  title = 'Zutaten hinzufügen',
  submitLabel = 'Hinzufügen',
}: {
  onAdd: (items: PickedItem[]) => void
  onClose: () => void
  title?: string
  submitLabel?: string
}) {
  const [text, setText] = useState('')
  const [matching, setMatching] = useState(false)
  const [lines, setLines] = useState<FoodMatchLine[]>([])
  const [rows, setRows] = useState<RowState[]>([])
  const [keys, setKeys] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [addingMore, setAddingMore] = useState(false)
  const [createBarcode, setCreateBarcode] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  const appendLines = (newLines: FoodMatchLine[]) => {
    setLines((p) => [...p, ...newLines])
    setKeys((p) => [...p, ...newLines.map(() => nextKey())])
    setRows((p) => [
      ...p,
      ...newLines.map((l) => ({ foodId: l.selectedFoodId ?? l.candidates[0]?.id ?? '', grams: l.suggestedAmountG })),
    ])
  }

  const matchText = async (input: string) => {
    if (!input.trim()) return
    setError(null)
    setMatching(true)
    try {
      const res = await api.foods.match(input)
      appendLines(res.lines)
      setText('')
      setAddingMore(false)
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        setText(input)
        setAddingMore(true)
      } else throw e
    } finally {
      setMatching(false)
    }
  }

  const stageFood = (food: FoodSummary) => {
    const suggested = food.servings[0]?.grams ?? 100
    appendLines([{
      raw: food.brand ? `${food.name} – ${food.brand}` : food.name,
      name: food.name,
      qty: null,
      unit: 'serving',
      amountGrams: null,
      suggestedAmountG: suggested,
      candidates: [food],
      selectedFoodId: food.id,
    }])
    setAddingMore(false)
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
        if (e.status === 404) setCreateBarcode(code)
        else setError(e.status === 503 ? 'Produktdatenbank gerade nicht erreichbar – später nochmal.' : e.message)
      } else {
        setError('Scan fehlgeschlagen.')
      }
    }
  }

  const handleRowChange = (i: number, v: RowState) => setRows((p) => p.map((r, xi) => (xi === i ? v : r)))
  const handleRowRemove = (i: number) => {
    setLines((p) => p.filter((_, xi) => xi !== i))
    setRows((p) => p.filter((_, xi) => xi !== i))
    setKeys((p) => p.filter((_, xi) => xi !== i))
  }
  const handleResearch = async (i: number, query: string) => {
    setError(null)
    try {
      const { results } = await api.foods.search(query)
      setLines((p) => p.map((l, xi) => (xi === i ? { ...l, candidates: results } : l)))
      setRows((p) => p.map((r, xi) => (
        xi === i
          ? { foodId: results[0]?.id ?? '', grams: r.grams > 0 ? r.grams : (results[0]?.servings[0]?.grams ?? 100) }
          : r
      )))
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else throw e
    }
  }

  const chosen = rows
    .map((r, i) => ({ ...r, line: lines[i] }))
    .filter((r) => r.foodId && r.grams > 0)

  const submit = () => {
    if (chosen.length === 0) return
    onAdd(chosen.map((r) => ({
      rawText: r.line?.raw ?? r.line?.name ?? '',
      productId: r.foodId,
      amountG: r.grams,
      food: r.line?.candidates.find((c) => c.id === r.foodId),
    })))
    onClose()
  }

  const view = matching ? 'busy' : lines.length > 0 && !addingMore ? 'review' : 'input'

  return createPortal(
    <div className="cal-overlay" onClick={onClose} role="presentation">
      <div className="add-sheet composer-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="add-sheet-head">
          <h3>{title}</h3>
          <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>

        {error && <p className="banner error"><IconAlert /><span className="banner-text">{error}</span></p>}

        <div className="composer-body" key={view}>
          {view === 'busy' && (
            <div className="match-loading">
              <span className="spinner" />
              <span className="match-loading-title">Zutaten werden gematcht…</span>
              <span className="match-loading-sub">Gleich kannst du prüfen und übernehmen.</span>
            </div>
          )}

          {view === 'input' && (
            <>
              {lines.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm composer-back" onClick={() => setAddingMore(false)}>
                  <IconChevronLeft /> Zurück zu {lines.length} {lines.length === 1 ? 'Zutat' : 'Zutaten'}
                </button>
              )}
              <textarea
                ref={composerRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder={'z. B.\n80g Haferflocken\n200ml Milch\n1 Banane'}
              />
              <div className="btn-row">
                <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }}
                  onClick={() => { void matchText(text) }} disabled={matching || !text.trim()}>
                  <IconWand /> Matchen
                </button>
                {isNativeApp() && (
                  <button type="button" className="btn btn-soft btn-lg" onClick={() => { void handleScan() }}
                    aria-label="Barcode scannen" title="Barcode scannen">
                    <IconScan /> Scannen
                  </button>
                )}
              </div>
              <p className="off-credit muted">
                Produktdaten u. a. von{' '}
                <a href="https://openfoodfacts.org" target="_blank" rel="noreferrer noopener">Open Food Facts</a>
                {' '}(ODbL)
              </p>
            </>
          )}

          {view === 'review' && (
            <>
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
              <button type="button" className="btn btn-soft composer-addmore"
                onClick={() => { setAddingMore(true); requestAnimationFrame(() => composerRef.current?.focus()) }}>
                <IconPlus /> Weitere Zutat
              </button>
              <div className="btn-row">
                <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }}
                  onClick={submit} disabled={chosen.length === 0}>
                  <IconPlus /> {submitLabel}{chosen.length > 1 ? ` (${chosen.length})` : ''}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {createBarcode && (
        <CustomFoodSheet
          barcode={createBarcode}
          onCreated={(food) => { setCreateBarcode(null); stageFood(food) }}
          onClose={() => setCreateBarcode(null)}
        />
      )}
    </div>,
    document.body,
  )
}
