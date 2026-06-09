import { describe, it, expect } from 'vitest'
import { buildFtsQuery, buildSearchTerms, foldGerman } from './search-terms.js'

describe('foldGerman', () => {
  it('transliterates umlauts and ß', () => {
    expect(foldGerman('Müsli süß')).toBe('muesli suess')
    expect(foldGerman('Öl Ähre')).toBe('oel aehre')
  })
})

describe('buildSearchTerms', () => {
  it('adds ue/oe/ae variants for umlaut tokens', () => {
    expect(buildSearchTerms('Müsli')).toContain('muesli')
    expect(buildSearchTerms('Hähnchenbrustfilet gebraten')).toContain('haehnchenbrustfilet')
  })

  it('splits known compound heads', () => {
    const terms = buildSearchTerms('Kalbslende gedünstet')
    expect(terms).toContain('lende')
    expect(terms).toContain('kalbs')
  })

  it('indexes the joined form of multi-word names', () => {
    expect(buildSearchTerms('Hafer Flocken')).toContain('haferflocken')
    expect(buildSearchTerms('Hafer Flocken, gekocht')).toContain('haferflocken')
  })

  it('includes brand tokens', () => {
    expect(buildSearchTerms('Skyr', 'Müller')).toContain('mueller')
  })
})

describe('buildFtsQuery', () => {
  it('returns null for empty/too-short input', () => {
    expect(buildFtsQuery('')).toBeNull()
    expect(buildFtsQuery('a !!')).toBeNull()
  })

  it('builds exact OR prefix per token, AND-ed between tokens', () => {
    expect(buildFtsQuery('kartoffel gekocht')).toBe(
      '("kartoffel" OR "kartoffel"*) AND ("gekocht" OR "gekocht"*)',
    )
  })

  it('adds transliteration alternatives for umlaut tokens', () => {
    expect(buildFtsQuery('müsli')).toBe('("müsli" OR "müsli"* OR "muesli" OR "muesli"*)')
  })

  it('strips embedded quotes', () => {
    expect(buildFtsQuery('ap"fel')).not.toContain('""')
  })

  it('adds singular variants for German plurals', () => {
    expect(buildFtsQuery('zwiebeln')).toContain('"zwiebel"*')
    expect(buildFtsQuery('frühlingszwiebeln')).toContain('"frühlingszwiebel"*')
    expect(buildFtsQuery('tomaten')).toContain('"tomat"*')
  })
})

describe('synonyms', () => {
  it('indexes Hüttenkäse for Körniger Frischkäse', () => {
    const terms = buildSearchTerms('Körniger Frischkäse < 10 % Fett i. Tr.')
    expect(terms).toContain('huettenkaese')
    expect(terms).toContain('cottage')
  })

  it('indexes Hafermilch for Haferdrink', () => {
    expect(buildSearchTerms('Haferdrink')).toContain('hafermilch')
  })
})
