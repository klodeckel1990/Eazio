// Android-Push über die FCM-HTTP-v1-API. Auth: Service-Account-JWT (RS256)
// gegen Googles Token-Endpoint eintauschen — kein firebase-admin-SDK nötig,
// jose + fetch reichen. Ohne FCM_SERVICE_ACCOUNT_PATH bleibt alles inert.
import { readFileSync } from 'node:fs'
import { importPKCS8, SignJWT, type CryptoKey } from 'jose'
import { env } from '../../config/env.js'
import type { PushMessage, SendResult } from './apns.js'

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

export function fcmConfigured(): boolean {
  return Boolean(env.FCM_SERVICE_ACCOUNT_PATH)
}

let account: ServiceAccount | null = null
let signingKey: CryptoKey | null = null
let cached: { accessToken: string; expiresAt: number } | null = null

function loadAccount(): ServiceAccount {
  account ??= JSON.parse(readFileSync(env.FCM_SERVICE_ACCOUNT_PATH!, 'utf8')) as ServiceAccount
  return account
}

async function accessToken(): Promise<string> {
  const now = Date.now()
  if (cached && now < cached.expiresAt - 5 * 60_000) return cached.accessToken
  const sa = loadAccount()
  signingKey ??= await importPKCS8(sa.private_key, 'RS256')
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(signingKey)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) throw new Error(`fcm token exchange failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cached = { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 }
  return data.access_token
}

/** Liefert wie sendApns ein SendResult; reason 'UNREGISTERED' → Token löschen. */
export async function sendFcm(deviceToken: string, msg: PushMessage): Promise<SendResult> {
  const token = await accessToken()
  const sa = loadAccount()
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: msg.title, body: msg.body },
          android: { priority: 'high' },
        },
      }),
    },
  )
  if (res.ok) return { ok: true, status: res.status, reason: null }
  let reason: string | null = null
  try {
    const body = (await res.json()) as {
      error?: { status?: string; details?: { errorCode?: string }[] }
    }
    reason = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status ?? null
  } catch {
    // kein JSON-Body
  }
  return { ok: false, status: res.status, reason }
}
