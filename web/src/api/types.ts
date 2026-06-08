export interface User { id: string; username: string }
export interface Account { id: string; label: string; yazioUsername: string; isDefault: boolean }
export interface Nutrition { kcal: number; carb: number; protein: number; fat: number }
export type Daytime = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Candidate {
  productId: string
  name: string
  producer: string
  isVerified: boolean
  baseUnit: string
  referenceAmount: number
  serving: string
  servingQuantity: number
  nutrientsPerReference: Nutrition
}
export interface MatchLine {
  raw: string
  name: string
  qty: number | null
  unit: 'g' | 'ml' | 'serving'
  amountGrams: number | null
  candidates: Candidate[]
  selectedProductId: string | null
}
export interface MatchResponse { accountId: string; lines: MatchLine[] }
export interface LogResult { logId: string; count: number; date: string; daytime: Daytime; accountId: string }
export interface LogLine { productId: string; name: string; amountGrams: number; serving?: string | null; servingQuantity?: number | null }
export interface Preset { id: string; name: string }
export interface PresetItem { position: number; rawText: string; productId: string; serving: string | null; servingQuantity: number | null; amountG: number }
export interface PresetWithItems extends Preset { items: PresetItem[] }
