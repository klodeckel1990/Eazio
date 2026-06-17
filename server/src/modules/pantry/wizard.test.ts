import { describe, it, expect } from 'vitest'
import { buildUserMessage, parseWizardText } from './wizard.js'

describe('wizard buildUserMessage', () => {
  it('lists pantry with units and the constraints', () => {
    const msg = buildUserMessage({
      style: 'lowcarb',
      taste: 'herzhaft',
      pantry: [
        { name: 'Magerquark', amount: 500, unit: 'g' },
        { name: 'Milch', amount: 1000, unit: 'ml' },
      ],
      budget: { kcal: 650, protein: 40, carbs: 80, fat: 20 },
    })
    expect(msg).toContain('- Magerquark: 500 g')
    expect(msg).toContain('- Milch: 1000 ml')
    expect(msg).toContain('Stil: Low Carb')
    expect(msg).toContain('Geschmack: herzhaft')
    expect(msg).toContain('ca. 650 kcal')
    expect(msg).toContain('Eiweiß 40 g')
  })

  it('notes when there is no budget', () => {
    const msg = buildUserMessage({ style: 'normal', taste: 'suess', pantry: [{ name: 'Banane', amount: 120, unit: 'g' }], budget: null })
    expect(msg).toContain('Kein Budget-Bezug')
    expect(msg).toContain('Stil: Normal')
    expect(msg).toContain('Geschmack: süß')
  })
})

describe('wizard parseWizardText', () => {
  const valid = JSON.stringify({
    title: 'Quark-Bowl',
    servings: 2,
    ingredients: [
      { raw: '250 g Magerquark', quantity: '250', unit: 'g', name: 'Magerquark' },
      { raw: '', quantity: '', unit: '', name: '' }, // wird verworfen
    ],
    steps: ['Quark verrühren.', '  ', 'Servieren.'],
    difficulty: 'einfach',
    totalMinutes: 5,
    nutritionPerServing: { kcal: 180, protein: 30, carbs: 8, fat: 2 },
    note: 'Eiweißreich.',
  })

  it('parses a valid object, forces servings=1 and drops empty ingredients/steps', () => {
    const r = parseWizardText(valid)!
    expect(r.title).toBe('Quark-Bowl')
    expect(r.servings).toBe(1)
    expect(r.ingredients).toHaveLength(1)
    expect(r.steps).toEqual(['Quark verrühren.', 'Servieren.'])
    expect(r.difficulty).toBe('einfach')
    expect(r.nutrition).toEqual({ kcal: 180, protein: 30, carbs: 8, fat: 2 })
    expect(r.note).toBe('Eiweißreich.')
  })

  it('extracts JSON wrapped in prose, defaults missing fields', () => {
    const r = parseWizardText('Hier dein Rezept:\n{"title":"","servings":1,"ingredients":[{"raw":"1 Ei","quantity":"1","unit":"Stück","name":"Ei"}],"steps":[],"difficulty":"x","totalMinutes":0,"nutritionPerServing":{"kcal":80,"protein":7,"carbs":0,"fat":5},"note":""}\nGuten Appetit!')!
    expect(r.title).toBe('Rezept aus deinem Vorrat') // Fallback bei leerem Titel
    expect(r.difficulty).toBeNull() // ungültiger enum-Wert
    expect(r.totalMinutes).toBeNull()
    expect(r.note).toBeNull()
    expect(r.nutrition.kcal).toBe(80)
  })

  it('returns null without parsable ingredients', () => {
    expect(parseWizardText('kein json')).toBeNull()
    expect(parseWizardText('{"ingredients":[]}')).toBeNull()
  })
})
