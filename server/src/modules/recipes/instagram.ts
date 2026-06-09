import { env } from '../../config/env.js'
import { RecipeImportError } from './errors.js'

const IG_URL = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\//i
// run-sync blocks until the actor finishes; keep under NPM's ~60s proxy timeout.
const TIMEOUT_MS = 55_000

export function isInstagramUrl(url: string): boolean {
  return IG_URL.test(url.trim())
}

/**
 * Resolves an Instagram post/reel URL to its caption via the Apify scraper.
 * Instagram has no usable public API for arbitrary posts, so this is the only
 * link path; without APIFY_TOKEN the caller should paste the caption instead.
 */
export async function fetchInstagramCaption(url: string): Promise<string> {
  const token = env.APIFY_TOKEN
  if (!token) {
    throw new RecipeImportError('fetch_failed', 400, 'instagram link needs the scraper or a pasted caption')
  }
  const actor = env.APIFY_INSTAGRAM_ACTOR.replace('/', '~') // Apify path uses ~ for owner/name
  const endpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        directUrls: [url],
        resultsType: 'posts',
        resultsLimit: 1,
        addParentData: false,
      }),
    })
  } catch {
    throw new RecipeImportError('fetch_failed', 502, 'instagram scrape timed out or failed')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) throw new RecipeImportError('fetch_failed', 502, `apify status ${res.status}`)

  let items: unknown
  try {
    items = await res.json()
  } catch {
    throw new RecipeImportError('fetch_failed', 502, 'unexpected apify response')
  }

  const caption = extractCaption(items)
  if (!caption) throw new RecipeImportError('no_content', 422, 'no caption found for that post')
  return caption
}

function extractCaption(items: unknown): string | null {
  if (!Array.isArray(items)) return null
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    for (const key of ['caption', 'text', 'title', 'description']) {
      const v = o[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (v && typeof v === 'object') {
        const nested = (v as Record<string, unknown>).text
        if (typeof nested === 'string' && nested.trim()) return nested.trim()
      }
    }
  }
  return null
}
