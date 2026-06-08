import { describe, it, expect } from 'vitest'
import { buildConsumedItem } from './consumed-item.js'

describe('buildConsumedItem', () => {
  it('builds a gram-based item with a generated uuid and null serving', () => {
    const item = buildConsumedItem({ productId: 'p1', amountGrams: 80 }, '2026-06-08', 'breakfast')
    expect(item).toMatchObject({
      product_id: 'p1', date: '2026-06-08', daytime: 'breakfast',
      amount: 80, serving: null, serving_quantity: null,
    })
    expect(item.id).toMatch(/[0-9a-f-]{36}/)
  })

  it('passes serving info through when provided', () => {
    const item = buildConsumedItem(
      { productId: 'p1', amountGrams: 120, serving: 'portion', servingQuantity: 1 },
      '2026-06-08', 'lunch',
    )
    expect(item).toMatchObject({ serving: 'portion', serving_quantity: 1, amount: 120 })
  })
})
