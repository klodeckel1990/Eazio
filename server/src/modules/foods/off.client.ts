// Minimal Open Food Facts v2 client for barcode lookups. OFF asks API users to
// identify themselves via User-Agent; results are cached in our foods table so
// each barcode hits OFF at most once per refresh window.

export class OffUnavailableError extends Error {
  constructor(message = 'open food facts unavailable') {
    super(message)
    this.name = 'OffUnavailableError'
  }
}

export interface OffProduct {
  code: string
  product_name?: string
  product_name_de?: string
  /** Comma string from the product API, string[] from search-a-licious. */
  brands?: string | string[]
  categories_tags?: string[]
  quantity?: string
  serving_quantity?: number | string
  serving_size?: string
  nutriments?: Record<string, number | string>
}

const FIELDS = [
  'code',
  'product_name',
  'product_name_de',
  'brands',
  'categories_tags',
  'quantity',
  'serving_quantity',
  'serving_size',
  'nutriments',
].join(',')

const USER_AGENT = 'Eazio/0.1 (jgossen@f-consulting.de)'

export type FetchOffProduct = (ean: string) => Promise<OffProduct | null>

/** Resolves a barcode against OFF. Returns null for unknown products; throws
 *  OffUnavailableError on network errors / 5xx so callers can degrade. */
export async function fetchOffProduct(ean: string): Promise<OffProduct | null> {
  let res: Response
  try {
    res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}?fields=${FIELDS}&lc=de`,
      { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(6000) },
    )
  } catch {
    throw new OffUnavailableError()
  }
  if (res.status === 404) return null
  if (!res.ok) throw new OffUnavailableError(`off status ${res.status}`)
  const body = (await res.json().catch(() => null)) as
    | { status: number; product?: OffProduct }
    | null
  if (!body) throw new OffUnavailableError('off returned invalid json')
  if (body.status !== 1 || !body.product) return null
  return body.product
}

export type SearchOffProducts = (query: string, limit?: number) => Promise<OffProduct[]>

/**
 * Full-text product search via search.openfoodfacts.org (search-a-licious).
 * Used as a best-effort fallback when the local index is sparse — failures
 * and outages just mean "no extra results", so this never throws.
 */
export async function searchOffProducts(query: string, limit = 8): Promise<OffProduct[]> {
  try {
    const res = await fetch(
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&langs=de&page_size=${limit}&fields=${FIELDS}`,
      { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(6000) },
    )
    if (!res.ok) return []
    const body = (await res.json().catch(() => null)) as { hits?: OffProduct[] } | null
    return (body?.hits ?? []).filter((p) => typeof p.code === 'string' && p.code.length > 0)
  } catch {
    return []
  }
}
