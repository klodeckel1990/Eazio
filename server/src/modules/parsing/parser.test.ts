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

  it('treats x as a count multiplier', () => {
    const p = parseLine('2x Brötchen')
    expect({ qty: p.qty, unit: p.unit, name: p.name }).toEqual({ qty: 2, unit: null, name: 'Brötchen' })
  })

  it('drops a quantity+unit chunk that has no ingredient name', () => {
    expect(parseIngredients('200ml')).toEqual([])
    expect(parseIngredients('80g Haferflocken, 200ml')).toHaveLength(1)
  })

  it('does not split on commas inside parentheses', () => {
    const lines = parseIngredients('2 EL flüssige Süße (Honig, Ahornsirup, Reissirup)')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.name).toBe('flüssige Süße')
  })

  it('strips parenthetical asides from the name but keeps raw', () => {
    const p = parseLine('1 kleine reife Banane (alternativ mehr Süße)')
    expect(p.name).toBe('kleine reife Banane')
    expect(p.raw).toBe('1 kleine reife Banane (alternativ mehr Süße)')
  })

  it('recombines quantity / unit / name split across lines (copy-paste)', () => {
    const text = '150\ng\nHeidelbeeren (frisch oder TK)\n1\nkleine Birne\n2\nEL\nMandeln'
    const lines = parseIngredients(text)
    expect(lines.map((l) => ({ qty: l.qty, unit: l.unit, name: l.name }))).toEqual([
      { qty: 150, unit: 'g', name: 'Heidelbeeren' },
      { qty: 1, unit: null, name: 'kleine Birne' },
      { qty: 2, unit: 'el', name: 'Mandeln' },
    ])
  })
})

describe('decimal commas and fractions', () => {
  it('keeps German decimal commas intact instead of splitting', () => {
    const lines = parseIngredients('100g Joghurt 3,5% Fett')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ qty: 100, unit: 'g', name: 'Joghurt 3,5% Fett' })
  })

  it('still splits on list commas', () => {
    const lines = parseIngredients('1 Apfel, 1 Banane')
    expect(lines.map((l) => l.name)).toEqual(['Apfel', 'Banane'])
  })

  it('parses fraction words as quantities', () => {
    expect(parseIngredients('Halbe Spitzpaprika')[0]).toMatchObject({ qty: 0.5, name: 'Spitzpaprika' })
    expect(parseIngredients('eine halbe Zitrone')[0]).toMatchObject({ qty: 0.5, name: 'Zitrone' })
    expect(parseIngredients('viertel Zwiebel')[0]).toMatchObject({ qty: 0.25, name: 'Zwiebel' })
  })

  it('parses numeric and unicode fractions, with optional unit', () => {
    expect(parseIngredients('1/2 TL Honig')[0]).toMatchObject({ qty: 0.5, unit: 'tl', name: 'Honig' })
    expect(parseIngredients('½ Banane')[0]).toMatchObject({ qty: 0.5, name: 'Banane' })
  })
})
