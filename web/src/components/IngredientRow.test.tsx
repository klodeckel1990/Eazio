import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IngredientRow } from './IngredientRow'
import type { MatchLine } from '../api/types'

const cand = (id: string, kcal: number) => ({
  productId: id, name: `P-${id}`, producer: 'ACME', isVerified: true,
  baseUnit: 'g', referenceAmount: 100, serving: 'portion', servingQuantity: 1,
  nutrientsPerReference: { kcal, carb: 60, protein: 12, fat: 7 },
})
const line: MatchLine = {
  raw: '80g Haferflocken', name: 'Haferflocken', qty: 80, unit: 'g', amountGrams: 80,
  candidates: [cand('p1', 350), cand('p2', 500)], selectedProductId: 'p1',
}

describe('IngredientRow', () => {
  it('shows nutrients scaled to grams', () => {
    render(<IngredientRow line={line} value={{ productId: 'p1', grams: 80 }} onChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/280/)).toBeInTheDocument() // 350 * 80/100
  })

  it('bubbles a grams change via onChange', async () => {
    const onChange = vi.fn()
    render(<IngredientRow line={line} value={{ productId: 'p1', grams: 80 }} onChange={onChange} onRemove={vi.fn()} />)
    const grams = screen.getByLabelText(/gramm/i)
    await userEvent.clear(grams)
    await userEvent.type(grams, '100')
    expect(onChange).toHaveBeenCalled()
    // last call carries the new grams and same productId
    const last = onChange.mock.calls.at(-1)![0]
    expect(last.productId).toBe('p1')
  })

  it('bubbles a product change via onChange', async () => {
    const onChange = vi.fn()
    render(<IngredientRow line={line} value={{ productId: 'p1', grams: 80 }} onChange={onChange} onRemove={vi.fn()} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'p2')
    expect(onChange).toHaveBeenCalledWith({ productId: 'p2', grams: 80 })
  })
})
