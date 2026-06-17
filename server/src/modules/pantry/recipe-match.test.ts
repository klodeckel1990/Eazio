import { describe, it, expect } from 'vitest'
import { matchRecipes } from './recipe-match.js'

const r = (id: string, title: string, ingredients: string[]) => ({ id, title, hasImage: false, ingredients })

describe('matchRecipes', () => {
  it('ignores seasonings/water, counts coverage and lists missing essentials', () => {
    const recipes = [
      r('r1', 'Porridge', ['Haferflocken', 'Milch', 'Banane', 'Salz', 'Wasser', 'Zimt']),
    ]
    const [m] = matchRecipes(recipes, ['Haferflocken', 'Milch'])
    expect(m!.total).toBe(3) // Salz/Wasser/Zimt zählen nicht
    expect(m!.have).toBe(2)
    expect(m!.missing).toEqual(['Banane'])
  })

  it('matches via substring and shared tokens, case/accent-insensitive', () => {
    const recipes = [r('r1', 'X', ['Haferflocken', 'Tomate'])]
    // Vorrat mit längerem Markennamen + Plural
    const [m] = matchRecipes(recipes, ['Kölln Blütenzarte Haferflocken', 'Tomaten'])
    expect(m!.have).toBe(2)
    expect(m!.missing).toHaveLength(0)
  })

  it('sorts by coverage ratio, best first', () => {
    const recipes = [
      r('low', 'Wenig', ['Reis', 'Hühnchen', 'Brokkoli', 'Sojasauce']),
      r('full', 'Alles', ['Nudeln', 'Tomaten']),
    ]
    const out = matchRecipes(recipes, ['Nudeln', 'Tomaten', 'Reis'])
    expect(out[0]!.recipeId).toBe('full') // 2/2 vor 1/3
    expect(out[0]!.have).toBe(2)
    expect(out[1]!.recipeId).toBe('low')
  })

  it('with empty pantry: total counted, everything missing', () => {
    const [m] = matchRecipes([r('r1', 'X', ['Nudeln', 'Tomaten', 'Salz'])], [])
    expect(m!.total).toBe(2)
    expect(m!.have).toBe(0)
    expect(m!.missing).toEqual(['Nudeln', 'Tomaten'])
  })

  it('drops recipes that are only seasonings', () => {
    expect(matchRecipes([r('r1', 'X', ['Salz', 'Pfeffer', 'Wasser'])], ['Nudeln'])).toHaveLength(0)
  })
})
