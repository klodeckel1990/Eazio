export type RecipeErrorCode =
  | 'import_unavailable' // no ANTHROPIC_API_KEY configured / auth failed
  | 'invalid_input' // neither url nor text, or a malformed url
  | 'fetch_failed' // could not load the url
  | 'no_content' // nothing recipe-like found
  | 'llm_failed' // the extraction model failed

/** Carries an HTTP status + stable error code for the import pipeline. */
export class RecipeImportError extends Error {
  constructor(
    public readonly code: RecipeErrorCode,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'RecipeImportError'
  }
}
