import { RecipeImportError } from './errors.js'

const USER_AGENT =
  'Mozilla/5.0 (compatible; EazioRecipeBot/1.0; +https://github.com/klodeckel1990/Eazio)'
const TIMEOUT_MS = 12_000
const MAX_BYTES = 3_000_000

/** Fetches a web page's HTML with a UA, timeout and size cap. http(s) only. */
export async function fetchHtml(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new RecipeImportError('invalid_input', 400, 'malformed url')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new RecipeImportError('invalid_input', 400, 'only http(s) urls are supported')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'de,en;q=0.8',
      },
    })
  } catch {
    throw new RecipeImportError('fetch_failed', 502, 'could not reach the url')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) throw new RecipeImportError('fetch_failed', 502, `upstream status ${res.status}`)

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
  if (contentType && !/(html|xml|text|json)/.test(contentType)) {
    throw new RecipeImportError('fetch_failed', 415, 'url did not return a web page')
  }

  const buf = await res.arrayBuffer()
  const slice = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf
  return new TextDecoder('utf-8').decode(slice)
}
