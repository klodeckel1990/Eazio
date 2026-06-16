import type { EntitlementUpdate } from './entitlements.js'

// RevenueCat-Webhook: https://www.revenuecat.com/docs/webhooks
// Wir interessieren uns nur für die abonnement-bezogenen Events und leiten daraus
// status + premiumUntil ab. Zugang hängt an premiumUntil (expiration_at_ms);
// CANCELLATION (Auto-Renew aus) lässt den Zugang bis zum Ablauf bestehen.

export interface RcWebhookEvent {
  type: string
  app_user_id?: string
  original_app_user_id?: string
  product_id?: string
  expiration_at_ms?: number | null
  purchased_at_ms?: number | null
  store?: string
}

const STATUS_BY_TYPE: Record<string, string> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  UNCANCELLATION: 'active',
  PRODUCT_CHANGE: 'active',
  NON_RENEWING_PURCHASE: 'active',
  CANCELLATION: 'cancelled', // Auto-Renew aus; Zugang bis premiumUntil
  EXPIRATION: 'expired',
  BILLING_ISSUE: 'billing_issue',
  SUBSCRIPTION_PAUSED: 'paused',
}

/** Events, die ein Entitlement verändern. Andere (TEST, TRANSFER, …) ignorieren. */
export function isRelevantEvent(type: string): boolean {
  return type in STATUS_BY_TYPE
}

const normStore = (s: string | undefined): string | null =>
  s ? s.toLowerCase() : null

/** Map a RevenueCat event onto our entitlement shape. Returns the app_user_id
 *  (= our user id, because the client calls Purchases.logIn(userId)) plus the
 *  update, or null when the event is irrelevant or carries no usable user id. */
export function parseRcEvent(
  event: RcWebhookEvent,
): { appUserId: string; update: EntitlementUpdate } | null {
  if (!event || !isRelevantEvent(event.type)) return null
  const appUserId = event.app_user_id || event.original_app_user_id
  // RC anonymous ids ($RCAnonymousID:…) können wir keinem Konto zuordnen.
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) return null
  return {
    appUserId,
    update: {
      status: STATUS_BY_TYPE[event.type] ?? 'none',
      premiumUntil: typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null,
      productId: event.product_id ?? null,
      store: normStore(event.store),
      rcAppUserId: appUserId,
    },
  }
}
