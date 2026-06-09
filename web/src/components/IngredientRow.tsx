import { useId, useState } from 'react'
import type { MatchLine } from '../api/types'
import { scaleNutrition, round } from '../lib/nutrition'
import { IconClose, IconSearch } from './icons'

export interface IngredientRowProps {
  line: MatchLine
  value: { productId: string; grams: number }
  onChange: (value: { productId: string; grams: number }) => void
  onRemove: () => void
  /** Re-run a Yazio search for this line with a user-edited query. */
  onResearch?: (query: string) => Promise<void>
}

export function IngredientRow({ line, value, onChange, onRemove, onResearch }: IngredientRowProps) {
  const sel = line.candidates.find(c => c.productId === value.productId)
  const n = sel ? scaleNutrition(sel.nutrientsPerReference, sel.referenceAmount, value.grams) : null

  const fieldId = useId()
  const gramsInputId = `${fieldId}-grams`

  const [query, setQuery] = useState(line.name)
  const [searching, setSearching] = useState(false)

  const setGrams = (grams: number) => onChange({ productId: value.productId, grams: Math.max(0, grams) })

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
            placeholder="Produkt suchen…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
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
          <label htmlFor={`${fieldId}-prod`}>Produkt</label>
          <select
            id={`${fieldId}-prod`}
            aria-label="Produkt"
            value={value.productId}
            onChange={e => onChange({ productId: e.target.value, grams: value.grams })}
          >
            {line.candidates.map(c => (
              <option key={c.productId} value={c.productId}>
                {c.name} – {c.producer}{c.isVerified ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={gramsInputId}>Menge</label>
          <div className="stepper">
            <button type="button" aria-label="Weniger" onClick={() => setGrams(value.grams - 10)}>−</button>
            <input
              id={gramsInputId}
              type="number"
              inputMode="decimal"
              aria-label="Gramm"
              value={value.grams}
              onChange={e => {
                const parsed = Number(e.target.value)
                onChange({ productId: value.productId, grams: isNaN(parsed) ? 0 : parsed })
              }}
            />
            <span className="unit">g</span>
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
