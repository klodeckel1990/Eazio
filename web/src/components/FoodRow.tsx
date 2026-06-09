import { useId, useState } from 'react'
import type { FoodMatchLine, FoodSummary } from '../api/types'
import { round } from '../lib/nutrition'
import { IconClose, IconSearch } from './icons'

export interface FoodRowProps {
  line: FoodMatchLine
  value: { foodId: string; grams: number }
  onChange: (value: { foodId: string; grams: number }) => void
  onRemove: () => void
  /** Re-search this line against the own food database with an edited query. */
  onResearch?: (query: string) => Promise<void>
}

const SOURCE_BADGE: Record<FoodSummary['source'], string> = {
  bls: 'BLS',
  off: 'Produkt',
  custom: 'Eigenes',
}

/** Nutrients in FoodSummary are per 100 g/ml — scale to the entered grams. */
function per(food: FoodSummary, grams: number) {
  const f = grams / 100
  const s = (v: number | null) => (v === null ? 0 : v * f)
  return { kcal: Math.round(food.kcal * f), carb: s(food.carbs), protein: s(food.protein), fat: s(food.fat) }
}

export function FoodRow({ line, value, onChange, onRemove, onResearch }: FoodRowProps) {
  const sel = line.candidates.find((c) => c.id === value.foodId)
  const n = sel ? per(sel, value.grams) : null

  const fieldId = useId()
  const [query, setQuery] = useState(line.name)
  const [searching, setSearching] = useState(false)

  const setGrams = (grams: number) => onChange({ foodId: value.foodId, grams: Math.max(0, grams) })

  const runSearch = async () => {
    if (!onResearch || !query.trim() || searching) return
    setSearching(true)
    try {
      await onResearch(query.trim())
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="ingredient">
      <div className="ing-head">
        <span className="ing-raw">{line.raw}</span>
        <button
          type="button"
          className="btn btn-icon btn-ghost btn-sm"
          onClick={onRemove}
          aria-label="Zutat entfernen"
          title="Entfernen"
        >
          <IconClose />
        </button>
      </div>

      {onResearch && (
        <div className="ing-search">
          <input
            type="text"
            aria-label="Suchbegriff"
            placeholder="Lebensmittel suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void runSearch()
              }
            }}
          />
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={() => { void runSearch() }}
            disabled={searching || !query.trim()}
            aria-label="Neu suchen"
            title="Neu suchen"
          >
            {searching ? <span className="spinner" /> : <IconSearch />}
          </button>
        </div>
      )}

      <div className="ing-controls">
        <div className="field grow">
          <label htmlFor={`${fieldId}-food`}>Lebensmittel</label>
          <select
            id={`${fieldId}-food`}
            aria-label="Lebensmittel"
            value={value.foodId}
            onChange={(e) => onChange({ foodId: e.target.value, grams: value.grams })}
          >
            {line.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.brand ? ` – ${c.brand}` : ''} [{SOURCE_BADGE[c.source]}]
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${fieldId}-grams`}>Menge</label>
          <div className="stepper">
            <button type="button" aria-label="Weniger" onClick={() => setGrams(value.grams - 10)}>−</button>
            <input
              id={`${fieldId}-grams`}
              type="number"
              inputMode="decimal"
              aria-label="Gramm"
              value={value.grams}
              onChange={(e) => {
                const parsed = Number(e.target.value)
                onChange({ foodId: value.foodId, grams: isNaN(parsed) ? 0 : parsed })
              }}
            />
            <span className="unit">{sel?.baseUnit === 'ml' ? 'ml' : 'g'}</span>
            <button type="button" aria-label="Mehr" onClick={() => setGrams(value.grams + 10)}>+</button>
          </div>
        </div>
      </div>

      {line.candidates.length === 0 ? (
        <span className="muted">Keine Treffer – Suchbegriff oben anpassen und ⏎.</span>
      ) : n ? (
        <div className="macros">
          <span className="macro kcal"><span className="v">{n.kcal}</span><span className="u">kcal</span></span>
          <span className="macro carb"><span className="v">{round(n.carb)}</span><span className="u">g KH</span></span>
          <span className="macro prot"><span className="v">{round(n.protein)}</span><span className="u">g Protein</span></span>
          <span className="macro fat"><span className="v">{round(n.fat)}</span><span className="u">g Fett</span></span>
        </div>
      ) : (
        <span className="muted">–</span>
      )}
    </div>
  )
}
