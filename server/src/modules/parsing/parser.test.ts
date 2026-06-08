import { describe, it, expect } from 'vitest'
import { parseIngredients, parseLine } from './parser.js'

describe('ingredient parser', () => {
  it.each([
    ['80g Haferflocken', { qty: 80, unit: 'g', name: 'Haferflocken' }],
    ['200 ml Milch', { qty: 200, unit: 'ml', name: 'Milch' }],
    ['1 Banane', { qty: 1, unit: null, name: 'Banane' }],
    ['2 EL Öl', { qty: 2, unit: 'el', name: 'Öl' }],
    ['Haferflocken 80g', { qty: 80, unit: 'g', name: 'Haferflocken' }],
    ['1,5 kg Mehl', { qty: 1.5, unit: 'kg', name: 'Mehl' }],
    ['Milch', { qty: null, unit: null, name: 'Milch' }],
    ['2 Eier', { qty: 2, unit: null, name: 'Eier' }],
  ])('parses %s', (input, expected) => {
    const p = parseLine(input)
    expect({ qty: p.qty, unit: p.unit, name: p.name }).toEqual(expected)
  })

  it('splits multi-line and comma input, dropping blanks', () => {
    const lines = parseIngredients('80g Haferflocken\n200ml Milch, 1 Banane\n\n')
    expect(lines.map((l) => l.name)).toEqual(['Haferflocken', 'Milch', 'Banane'])
  })
})
