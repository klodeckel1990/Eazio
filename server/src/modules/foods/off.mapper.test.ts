import { describe, it, expect } from 'vitest'
import { mapOffProduct } from './off.mapper.js'

const BASE = {
  code: '4311501043686',
  product_name: 'Crunchy Oats',
  product_name_de: 'Knusper-Hafer',
  brands: 'EDEKA, Gut & Günstig',
  categories_tags: ['en:cereals', 'en:mueslis'],
  serving_quantity: 40,
  serving_size: '40 g',
  nutriments: {
    'energy-kcal_100g': 412,
    proteins_100g: 9.5,
    fat_100g: 12,
    'saturated-fat_100g': 2.1,
    carbohydrates_100g: 62,
    sugars_100g: 14,
    fiber_100g: 7.5,
    salt_100g: 0.3,
    sodium_100g: 0.12,
  },
}

describe('mapOffProduct', () => {
  it('maps a complete product, preferring the German name and first brand', () => {
    const food = mapOffProduct('4311501043686', BASE)!
    expect(food).toMatchObject({
      id: 'off:4311501043686',
      source: 'off',
      sourceId: '4311501043686',
      barcode: '4311501043686',
      name: 'Knusper-Hafer',
      brand: 'EDEKA',
      kcal: 412,
      protein: 9.5,
      salt: 0.3,
    })
    expect(food.sodium).toBe(120) // g → mg
    expect(JSON.parse(food.servingsJson!)).toEqual([{ label: '40 g', grams: 40 }])
  })

  it('derives kcal from kJ when energy-kcal is missing', () => {
    const food = mapOffProduct('1', {
      ...BASE,
      nutriments: { energy_100g: 1724 },
    })!
    expect(food.kcal).toBeCloseTo(412.0, 1)
  })

  it('returns null without any energy value or name', () => {
    expect(mapOffProduct('1', { ...BASE, nutriments: {} })).toBeNull()
    expect(
      mapOffProduct('1', { ...BASE, product_name: '', product_name_de: '' }),
    ).toBeNull()
  })

  it('detects ml products from the quantity string', () => {
    const food = mapOffProduct('2', { ...BASE, quantity: '500 ml' })!
    expect(food.baseUnit).toBe('ml')
    expect(mapOffProduct('3', { ...BASE, quantity: '250 g' })!.baseUnit).toBe('g')
  })
})
