import { randomUUID } from 'node:crypto'
import type { Daytime } from '../meals/daytime.js'

export interface LogItemInput {
  productId: string
  amountGrams: number
  serving?: string | null
  servingQuantity?: number | null
}

export interface ConsumedItem {
  id: string
  product_id: string
  date: string
  daytime: Daytime
  amount: number
  serving: string | null
  serving_quantity: number | null
}

export function buildConsumedItem(input: LogItemInput, date: string, daytime: Daytime): ConsumedItem {
  return {
    id: randomUUID(),
    product_id: input.productId,
    date,
    daytime,
    amount: input.amountGrams,
    serving: input.serving ?? null,
    serving_quantity: input.servingQuantity ?? null,
  }
}
