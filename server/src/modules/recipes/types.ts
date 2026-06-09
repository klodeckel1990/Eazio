export interface ExtractedIngredient {
  /** The original line as written in the source. */
  raw: string
  /** Amount as a string so ranges ("2-3") and fractions ("1/2") survive; "" if none. */
  quantity: string
  /** Unit (g, ml, el, tl, stück, …), lowercased; "" if none. */
  unit: string
  /** Core ingredient name without amount/unit/prep notes. */
  name: string
}

export interface ImportedRecipe {
  title: string | null
  /** Number of portions, or null when unknown. */
  servings: number | null
  /** Source URL when imported from a link. */
  sourceUrl: string | null
  source: 'link' | 'text'
  ingredients: ExtractedIngredient[]
}
