import { describe, it, expect } from 'vitest'
import { normalizeName, buildSearchQuery, isPrepNote, isSeasoning } from './normalize.js'

describe('normalizeName', () => {
  it('lowercases, strips accents, collapses whitespace', () => {
    expect(normalizeName('  Haferflocken ')).toBe('haferflocken')
    expect(normalizeName('Müsli   Crunchy')).toBe('musli crunchy')
    expect(normalizeName('Café')).toBe('cafe')
    expect(normalizeName('Straße')).toBe('strasse')
  })
})

describe('buildSearchQuery', () => {
  it('drops qualifier / filler words', () => {
    expect(buildSearchQuery('kleine reife Banane')).toBe('Banane')
    expect(buildSearchQuery('gemischte Beeren der Saison')).toBe('Beeren')
  })

  it('keeps the first of "X oder Y" alternatives', () => {
    expect(buildSearchQuery('geschrotete Leinsamen oder Hanfsamen pro Portion')).toBe('Leinsamen')
  })

  it('leaves clean product names untouched (incl. compound words)', () => {
    expect(buildSearchQuery('Haferflocken feinblatt')).toBe('Haferflocken feinblatt')
    expect(buildSearchQuery('Skyr Joghurt')).toBe('Skyr Joghurt')
  })

  it('falls back to the original when everything would strip out', () => {
    expect(buildSearchQuery('der die das')).toBe('der die das')
  })
})

describe('isSeasoning', () => {
  it('flags pure seasonings (incl. compounds and herbs)', () => {
    expect(isSeasoning('Salz')).toBe(true)
    expect(isSeasoning('Salz und Pfeffer')).toBe(true)
    expect(isSeasoning('frischer Thymian')).toBe(true)
    expect(isSeasoning('Meersalz')).toBe(true)
    expect(isSeasoning('Paprikapulver')).toBe(true)
  })

  it('keeps ambiguous foods and caloric items', () => {
    expect(isSeasoning('Paprika')).toBe(false)
    expect(isSeasoning('Knoblauch')).toBe(false)
    expect(isSeasoning('Salzkartoffeln')).toBe(false)
    expect(isSeasoning('Haferflocken')).toBe(false)
  })
})

describe('purpose clauses in buildSearchQuery', () => {
  it('strips "zum/für …" tails so the product term remains', () => {
    expect(buildSearchQuery('Öl zum Braten')).toBe('Öl')
    expect(buildSearchQuery('Schokolade zum Verzieren')).toBe('Schokolade')
    expect(buildSearchQuery('Butterschmalz zum Ausbacken')).toBe('Butterschmalz')
  })
})

describe('isPrepNote', () => {
  it('flags negligible greasing/dusting notes', () => {
    expect(isPrepNote('etwas Butter für die Form')).toBe(true)
    expect(isPrepNote('Butter für die Springform')).toBe(true)
    expect(isPrepNote('Öl zum Einfetten')).toBe(true)
    expect(isPrepNote('Mehl für die Arbeitsfläche')).toBe(true)
    expect(isPrepNote('Mehl zum Bestäuben')).toBe(true)
  })

  it('keeps consumed fats and regular ingredients', () => {
    expect(isPrepNote('Öl zum Braten')).toBe(false)
    expect(isPrepNote('Butterschmalz zum Ausbacken')).toBe(false)
    expect(isPrepNote('100 g weiche Butter')).toBe(false)
    expect(isPrepNote('Butter')).toBe(false)
  })
})
