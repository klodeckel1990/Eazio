// dotenv is used (over Node's --env-file) for a single consistent load path
// across all runtime contexts (dev, test, prod) without requiring a CLI flag.
import 'dotenv/config'
import { z } from 'zod'

// Accept common truthy spellings so Docker-style `COOKIE_SECURE=1` works as expected.
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on'])
const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : TRUE_VALUES.has(v.trim().toLowerCase())))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_PATH: z.string().default('./data/eazio.db'),
  MASTER_KEY: z
    .string()
    .refine((v) => {
      try {
        return Buffer.from(v, 'base64').length === 32
      } catch {
        return false
      }
    }, 'MASTER_KEY must be 32 bytes encoded as base64'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 chars'),
  ADMIN_BOOTSTRAP: z.string().min(8, 'ADMIN_BOOTSTRAP must be at least 8 chars'),
  TZ: z.string().default('Europe/Berlin'),
  COOKIE_SECURE: boolish.default(true),
  // Extra CORS origins (CSV) beyond the built-in Capacitor/dev allowlist,
  // e.g. a staging web origin hitting the API cross-origin.
  CORS_EXTRA_ORIGINS: z.string().optional(),
  YAZIO_COUNTRIES: z.string().default('DE'),
  YAZIO_LOCALES: z.string().default('de_DE,de_US'),
  // Recipe import (LLM ingredient extraction). Optional so the server boots and
  // tests run without it; the import route checks at runtime and returns a clear
  // error when it's missing.
  ANTHROPIC_API_KEY: z.string().optional(),
  RECIPE_LLM_MODEL: z.string().default('claude-haiku-4-5'),
  // Mahlzeiten-Foto-Analyse (Zutaten + Mengenschätzung) — stärkeres Vision-Modell
  // als der Rezept-Import, weil Portionsschätzung aus dem Bild anspruchsvoller ist.
  PHOTO_LLM_MODEL: z.string().default('claude-sonnet-4-6'),
  // Shared Secret für den RevenueCat-Webhook (Authorization-Header). Ohne diesen
  // Wert lehnt die Webhook-Route alle Aufrufe ab (kein Entitlement-Schreibweg).
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
  // Optional Apify token to resolve Instagram links (caption scraping) on import.
  // Without it, Instagram links fall back to "paste the caption".
  APIFY_TOKEN: z.string().optional(),
  APIFY_INSTAGRAM_ACTOR: z.string().default('apify/instagram-scraper'),
  // Social Sign-In (Google/Apple). Die Client-IDs sind öffentlich (keine
  // Secrets) und dienen serverseitig als erlaubte Token-Audiences. Google
  // bleibt deaktiviert, bis mindestens eine ID gesetzt ist; natives
  // "Sign in with Apple" braucht nur die Bundle-ID und läuft ohne Setup.
  GOOGLE_WEB_CLIENT_ID: z.string().optional(),
  GOOGLE_IOS_CLIENT_ID: z.string().optional(),
  APPLE_APP_CLIENT_ID: z.string().default('de.tellerwert.app'),
  // Apple Services ID — nur für "Sign in with Apple" im Web-Browser nötig.
  APPLE_WEB_CLIENT_ID: z.string().optional(),
  // Push (APNs). Ohne Key bleibt der Versand inert; die Routen registrieren
  // Tokens trotzdem, damit nichts verloren geht, bis der Key da ist.
  APNS_KEY_PATH: z.string().optional(), // .p8 aus dem Developer-Portal
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().default('34N9P46A9K'),
  APNS_TOPIC: z.string().default('de.tellerwert.app'),
  // Android-Push: Pfad zum Firebase-Service-Account-JSON (FCM HTTP v1).
  FCM_SERVICE_ACCOUNT_PATH: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // Use z.flattenError (zod v4 standalone helper) for field-level error display.
  // parsed.error.flatten() also works in zod v4 but z.flattenError is the idiomatic form.
  console.error('Invalid environment configuration:', z.flattenError(parsed.error).fieldErrors)
  throw new Error('Invalid environment configuration')
}

export const env = parsed.data
export type Env = z.infer<typeof schema>
