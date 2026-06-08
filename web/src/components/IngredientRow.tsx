import { useId } from 'react'
import type { MatchLine } from '../api/types'
import { scaleNutrition, round } from '../lib/nutrition'

export interface IngredientRowProps {
  line: MatchLine
  value: { productId: string; grams: number }
  onChange: (value: { productId: string; grams: number }) => void
  onRemove: () => void
}

export function IngredientRow({ line, value, onChange, onRemove }: IngredientRowProps) {
  const sel = line.candidates.find(c => c.productId === value.productId)

  let nutrientSummary: string
  if (sel) {
    const n = scaleNutrition(sel.nutrientsPerReference, sel.referenceAmount, value.grams)
    nutrientSummary = `${n.kcal} kcal · ${n.carb} g KH · ${round(n.protein)} g P · ${round(n.fat)} g F`
  } else {
    nutrientSummary = '–'
  }

  const fieldId = useId()
  const gramsInputId = `${fieldId}-grams`

  return (
    <div className="ingredient-row">
      <small className="muted">{line.raw}</small>

      <select
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

      <label htmlFor={gramsInputId}>Gramm</label>
      <input
        id={gramsInputId}
        type="number"
        value={value.grams}
        onChange={e => {
          const parsed = Number(e.target.value)
          onChange({ productId: value.productId, grams: isNaN(parsed) ? 0 : parsed })
        }}
      />

      <span className="muted">{nutrientSummary}</span>

      <button type="button" onClick={onRemove}>✕</button>
    </div>
  )
}
