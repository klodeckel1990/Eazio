import { fetchHtml } from './fetch.js'
import { extractFromHtml } from './extract.js'
import { extractWithLlm } from './llm.js'
import { isInstagramUrl, fetchInstagramCaption } from './instagram.js'
import { RecipeImportError } from './errors.js'
import type { ImportedRecipe } from './types.js'

export interface ImportInput {
  url?: string
  text?: string
  /** Target language (locale or bare code) for translation; defaults to German. */
  targetLang?: string
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
  let jsonLdInstructions: string[] = []
  let jsonLdMinutes: number | null = null
  let imageUrl: string | null = null
  let sourceUrl: string | null = null
  let source: 'link' | 'text'

  if (input.url) {
    source = 'link'
    sourceUrl = input.url
    if (isInstagramUrl(input.url)) {
      // Instagram has no usable public API → resolve caption + image via the scraper.
      const ig = await fetchInstagramCaption(input.url)
      llmInput = ig.text
      imageUrl = ig.imageUrl
    } else {
      const html = await fetchHtml(input.url)
      const extracted = extractFromHtml(html)
      imageUrl = extracted.imageUrl
      if (extracted.ingredients.length > 0) {
        jsonLdTitle = extracted.title
        jsonLdServings = extracted.servings
        jsonLdInstructions = extracted.instructions
        jsonLdMinutes = extracted.totalMinutes
        // Feed title + steps through the LLM too so they get translated/normalized
        // alongside the ingredients (JSON-LD carries them in the source language).
        const parts: string[] = []
        if (jsonLdTitle) parts.push(`Titel: ${jsonLdTitle}`)
        parts.push(`Zutaten:\n${extracted.ingredients.join('\n')}`)
        if (jsonLdInstructions.length > 0) parts.push(`Zubereitung:\n${jsonLdInstructions.join('\n')}`)
        llmInput = parts.join('\n\n')
      } else {
        llmInput = extracted.text ?? ''
      }
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

  const llm = await extractWithLlm(llmInput, input.targetLang)
  if (llm.ingredients.length === 0) {
    throw new RecipeImportError('no_content', 422, 'no ingredients could be extracted')
  }

  // The LLM now returns the *translated* title/steps (it was fed the JSON-LD
  // ones), so prefer them; fall back to the raw JSON-LD values if it dropped any.
  // servings/minutes are language-agnostic numbers — keep trusting JSON-LD there.
  return {
    title: llm.title ?? jsonLdTitle,
    servings: jsonLdServings ?? llm.servings,
    sourceUrl,
    source,
    imageUrl,
    difficulty: llm.difficulty,
    totalMinutes: jsonLdMinutes ?? llm.totalMinutes,
    ingredients: llm.ingredients,
    steps: llm.steps.length > 0 ? llm.steps : jsonLdInstructions,
  }
}
