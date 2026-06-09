import { fetchHtml } from './fetch.js'
import { extractFromHtml } from './extract.js'
import { extractWithLlm } from './llm.js'
import { RecipeImportError } from './errors.js'
import type { ImportedRecipe } from './types.js'

export interface ImportInput {
  url?: string
  text?: string
}

/**
 * Import pipeline: link → fetch → JSON-LD (schema.org) → readability/og text;
 * or pasted text. The best available text is then normalized by the LLM into a
 * structured ingredient list. JSON-LD title/servings win over the LLM's guess.
 */
export async function importRecipe(input: ImportInput): Promise<ImportedRecipe> {
  let llmInput: string
  let jsonLdTitle: string | null = null
  let jsonLdServings: number | null = null
  let sourceUrl: string | null = null
  let source: 'link' | 'text'

  if (input.url) {
    source = 'link'
    sourceUrl = input.url
    const html = await fetchHtml(input.url)
    const extracted = extractFromHtml(html)
    if (extracted.ingredients.length > 0) {
      jsonLdTitle = extracted.title
      jsonLdServings = extracted.servings
      llmInput = extracted.ingredients.join('\n')
    } else {
      llmInput = extracted.text ?? ''
    }
  } else if (input.text && input.text.trim()) {
    source = 'text'
    llmInput = input.text
  } else {
    throw new RecipeImportError('invalid_input', 400, 'provide a url or text')
  }

  if (!llmInput.trim()) {
    throw new RecipeImportError('no_content', 422, 'no recipe content found at that link')
  }

  const llm = await extractWithLlm(llmInput)
  if (llm.ingredients.length === 0) {
    throw new RecipeImportError('no_content', 422, 'no ingredients could be extracted')
  }

  return {
    title: jsonLdTitle ?? llm.title,
    servings: jsonLdServings ?? llm.servings,
    sourceUrl,
    source,
    ingredients: llm.ingredients,
  }
}
