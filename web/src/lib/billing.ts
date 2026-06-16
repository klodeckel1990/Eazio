// RevenueCat-Anbindung (nur native). Wie die anderen Plugins per dynamischem
// import() geladen, damit das Web-Bundle sauber bleibt. Quelle der Wahrheit für
// das GATING ist der Server (/api/auth/me.premium + 403-Antworten); RC dient der
// Kaufabwicklung und dem sofortigen UI-Feedback nach dem Kauf.
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor'
import { getPlatform } from './social-login'
import { isNativeApp } from './barcode'

// Öffentliche RevenueCat-SDK-Keys (dürfen im Client stehen).
const RC_KEYS = {
  ios: 'appl_uJjJgSnnhgtkHqimDOfWrkYxKuj',
  android: 'goog_SoSIUWBvVEtplUaJffHvEhqalvT',
}
const ENTITLEMENT_ID = 'premium'

let configured = false

const rc = () => import('@revenuecat/purchases-capacitor')

/** Käufe sind nur in der nativen App möglich (StoreKit/Play Billing). */
export function billingAvailable(): boolean {
  return isNativeApp() && (getPlatform() === 'ios' || getPlatform() === 'android')
}

/** Beim Auth-Erfolg: RC mit unserer userId verknüpfen (app_user_id = userId),
 *  damit der Webhook unsere User-ID trägt. Idempotent. */
export async function configureBilling(userId: string): Promise<void> {
  if (!billingAvailable()) return
  try {
    const { Purchases } = await rc()
    const apiKey = getPlatform() === 'ios' ? RC_KEYS.ios : RC_KEYS.android
    if (!configured) {
      await Purchases.configure({ apiKey, appUserID: userId })
      configured = true
    } else {
      await Purchases.logIn({ appUserID: userId })
    }
  } catch {
    // Billing ist optional fürs App-Funktionieren — Fehler schlucken.
  }
}

export async function logoutBilling(): Promise<void> {
  if (!billingAvailable() || !configured) return
  try {
    const { Purchases } = await rc()
    await Purchases.logOut()
  } catch {
    /* best-effort */
  }
}

export interface BillingPackage {
  id: string
  period: 'month' | 'year' | 'other'
  priceString: string
  raw: PurchasesPackage
}

const periodOf = (type: string): BillingPackage['period'] =>
  type === 'MONTHLY' ? 'month' : type === 'ANNUAL' ? 'year' : 'other'

/** Aktuelle Angebote (Monats-/Jahres-Paket). Leer auf Web/ohne Offering. */
export async function getPackages(): Promise<BillingPackage[]> {
  if (!billingAvailable()) return []
  const { Purchases } = await rc()
  const offerings = await Purchases.getOfferings()
  const pkgs = offerings.current?.availablePackages ?? []
  return pkgs.map((p) => ({
    id: p.identifier,
    period: periodOf(p.packageType),
    priceString: p.product.priceString,
    raw: p,
  }))
}

const hasPremium = (info: { entitlements: { active: Record<string, unknown> } }): boolean =>
  Boolean(info.entitlements.active[ENTITLEMENT_ID])

/** Kauf abwickeln → true, wenn das Premium-Entitlement danach aktiv ist. */
export async function purchase(pkg: BillingPackage): Promise<boolean> {
  if (!billingAvailable()) return false
  const { Purchases } = await rc()
  const res = await Purchases.purchasePackage({ aPackage: pkg.raw })
  return hasPremium(res.customerInfo)
}

/** Käufe wiederherstellen → true, wenn danach Premium aktiv ist. */
export async function restorePurchases(): Promise<boolean> {
  if (!billingAvailable()) return false
  const { Purchases } = await rc()
  const res = await Purchases.restorePurchases()
  return hasPremium(res.customerInfo)
}
