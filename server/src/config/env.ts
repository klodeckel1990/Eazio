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
  YAZIO_COUNTRIES: z.string().default('DE'),
  YAZIO_LOCALES: z.string().default('de_DE,de_US'),
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
