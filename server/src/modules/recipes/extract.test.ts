import { describe, it, expect } from 'vitest'
import { extractFromHtml } from './extract.js'

const JSONLD = `<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Recipe","name":"Haferbrei","recipeYield":"2 Portionen","recipeIngredient":["100 g Haferflocken","200 ml Milch","1 Prise Salz"]}
</script></head><body>...</body></html>`

describe('extractFromHtml', () => {
  it('reads recipeIngredient / name / yield from JSON-LD', () => {
    const r = extractFromHtml(JSONLD)
    expect(r.title).toBe('Haferbrei')
    expect(r.servings).toBe(2)
    expect(r.ingredients).toEqual(['100 g Haferflocken', '200 ml Milch', '1 Prise Salz'])
    expect(r.text).toBeNull()
  })

  it('unwraps a Recipe nested in @graph', () => {
    const html = `<script type="application/ld+json">{"@context":"x","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"X","recipeIngredient":["1 Ei"]}]}</script>`
    expect(extractFromHtml(html).ingredients).toEqual(['1 Ei'])
  })

  it('handles an @type array and a QuantitativeValue yield', () => {
    const html = `<script type="application/ld+json">{"@type":["Thing","Recipe"],"recipeYield":{"value":4},"recipeIngredient":["2 EL Öl"]}</script>`
    const r = extractFromHtml(html)
    expect(r.servings).toBe(4)
    expect(r.ingredients).toEqual(['2 EL Öl'])
  })

  it('ignores malformed JSON-LD and falls back to stripped text', () => {
    const html = `<html><body><script type="application/ld+json">{not json}</script><h2>Zutaten</h2><p>100 g Mehl</p><script>var x=1</script></body></html>`
    const r = extractFromHtml(html)
    expect(r.ingredients).toEqual([])
    expect(r.text).toContain('Zutaten')
    expect(r.text).toContain('100 g Mehl')
    expect(r.text).not.toContain('var x')
  })

  it('falls back to og:description when there is no body text', () => {
    const html = `<html><head><meta property="og:description" content="80g Haferflocken, 1 Banane"></head><body></body></html>`
    expect(extractFromHtml(html).text).toBe('80g Haferflocken, 1 Banane')
  })
})
