import { useId } from 'react'
import type { MatchLine } from '../api/types'
import { scaleNutrition, round } from '../lib/nutrition'
import { IconClose } from './icons'

export interface IngredientRowProps {
  line: MatchLine
  value: { productId: string; grams: number }
  onChange: (value: { productId: string; grams: number }) => void
  onRemove: () => void
}

export function IngredientRow({ line, value, onChange, onRemove }: IngredientRowProps) {
  const sel = line.candidates.find(c => c.productId === value.productId)
  const n = sel ? scaleNutrition(sel.nutrientsPerReference, sel.referenceAmount, value.grams) : null

  const fieldId = useId()
  const gramsInputId = `${fieldId}-grams`

  const setGrams = (grams: number) => onChange({ productId: value.productId, grams: Math.max(0, grams) })

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

      {n ? (
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
