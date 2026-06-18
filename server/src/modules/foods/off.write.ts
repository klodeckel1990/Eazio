// Open Food Facts Add-Product-Client: trägt ein (eigenes, barcodiertes) Produkt
// in die offene Datenbank zurück. Gegenstück zu off.client.ts (nur Lesen). OFF
// nimmt Schreibzugriffe über das klassische cgi/product_jqm2.pl entgegen, per
// Account-Credentials (user_id/password). Default-Base ist der TEST-Server
// (.net) — Produktivbeiträge erst nach explizitem OFF_WRITE_BASE. Ohne
// Credentials ist das Feature inert (offContributeEnabled() === false).

import { env } from '../../config/env.js'

export interface OffContributePayload {
  barcode: string
  name: string
  brand: string | null
  baseUnit: string // g|ml
  kcal: number
  protein: number | null
  fat: number | null
  saturatedFat: number | null
  carbs: number | null
  sugar: number | null
  fiber: number | null
  salt: number | null
}

export interface OffContributeResult {
  ok: boolean
  statusVerbose: string
}

export type ContributeOffProduct = (p: OffContributePayload) => Promise<OffContributeResult>

/** Schreiben ist nur aktiv, wenn ein OFF-Konto hinterlegt ist. */
export function offContributeEnabled(): boolean {
  return Boolean(env.OFF_USER_ID && env.OFF_PASSWORD)
}

const userAgent = (): string => `${env.OFF_APP_NAME}/1.0 (https://tellerwert.de)`

/**
 * Trägt ein Produkt bei OFF ein (anlegen oder ergänzen — OFF upsertet per
 * Barcode). Wirft nie: Netz-/Serverfehler werden als { ok:false } gemeldet,
 * damit der Beitrag den Produkt-Anlage-Flow des Nutzers nie blockiert.
 */
export async function contributeOffProduct(p: OffContributePayload): Promise<OffContributeResult> {
  const form = new URLSearchParams()
  form.set('code', p.barcode)
  form.set('user_id', env.OFF_USER_ID ?? '')
  form.set('password', env.OFF_PASSWORD ?? '')
  form.set('lang', 'de')
  form.set('lc', 'de')
  form.set('product_name_de', p.name)
  if (p.brand) form.set('brands', p.brand)
  // OFF speichert Nährwerte pro 100 g; bei Getränken nehmen wir (wie die App)
  // Dichte ≈ 1 an und tragen sie ebenfalls als 100-g-Basis ein.
  form.set('nutrition_data_per', '100g')
  form.set('nutriment_energy-kcal', String(p.kcal))
  form.set('nutriment_energy-kcal_unit', 'kcal')
  const setN = (key: string, val: number | null): void => {
    if (val === null) return
    form.set(`nutriment_${key}`, String(val))
    form.set(`nutriment_${key}_unit`, 'g')
  }
  setN('proteins', p.protein)
  setN('fat', p.fat)
  setN('saturated-fat', p.saturatedFat)
  setN('carbohydrates', p.carbs)
  setN('sugars', p.sugar)
  setN('fiber', p.fiber)
  setN('salt', p.salt)
  form.set('comment', `Beigetragen über ${env.OFF_APP_NAME}`)
  form.set('app_name', env.OFF_APP_NAME)
  form.set('app_version', '1.0')

  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': userAgent(),
  }
  // Der OFF-Staging-Server (.net) liegt hinter HTTP-Basic-Auth (off:off).
  if (env.OFF_WRITE_BASIC) {
    headers.authorization = `Basic ${Buffer.from(env.OFF_WRITE_BASIC).toString('base64')}`
  }

  let res: Response
  try {
    res = await fetch(`${env.OFF_WRITE_BASE}/cgi/product_jqm2.pl`, {
      method: 'POST',
      headers,
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return { ok: false, statusVerbose: 'network error' }
  }
  const body = (await res.json().catch(() => null)) as
    | { status?: number; status_verbose?: string }
    | null
  if (!res.ok || !body) return { ok: false, statusVerbose: `http ${res.status}` }
  return { ok: body.status === 1, statusVerbose: String(body.status_verbose ?? '') }
}
